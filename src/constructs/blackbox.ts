import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { Probe, PrometheusRule, PrometheusRuleSpecGroupsRulesExpr } from '../imports/monitoring.coreos.com';
import { MonitoringConfig } from '../types';
import { HELM_CHART_FAILURE_POLICY } from './helm-chart';

export interface BlackboxProps {
  namespace: string;
  config: MonitoringConfig;
}

const DAY = 86400;
const EXPORTER = 'blackbox-exporter';

/**
 * Opt-in blackbox-exporter that probes public endpoints from inside the cluster.
 *
 * `http_2xx` fetches a URL, follows redirects and expects a 2xx answer with a
 * valid certificate; `tls_connect` only completes a TLS handshake, for ports
 * that speak no HTTP (IMAPS, SMTPS). Both prefer IPv4, because nodes may have
 * no global IPv6 route.
 *
 * The probes leave the cluster through the node's egress, but a request to the
 * cluster's own load balancer address can be short-cut by the CNI, so these
 * probes check routing, the application and the certificate, not the external
 * load balancer or DNS.
 *
 * Each stage pair (warning, critical) inhibits per target in
 * PrometheusStackConstruct; the generic rule inhibits by namespace, and every
 * probe lives in the monitoring namespace.
 *
 * Sync Wave: 3 (advanced services).
 */
export class BlackboxConstruct extends Construct {
  constructor(scope: Construct, id: string, props: BlackboxProps) {
    super(scope, id);
    const { namespace, config } = props;
    const { blackbox } = config;

    const labels = {
      'app.kubernetes.io/name': EXPORTER,
      'app.kubernetes.io/component': 'probes',
      'app.kubernetes.io/managed-by': 'cdk8s',
      'app.kubernetes.io/part-of': 'monitoring',
    };

    new ApiObject(this, 'blackbox-exporter', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: EXPORTER,
        namespace,
        labels,
        annotations: { 'argocd.argoproj.io/sync-wave': '3' },
      },
      spec: {
        repo: 'https://prometheus-community.github.io/helm-charts',
        chart: 'prometheus-blackbox-exporter',
        version: config.versions.blackboxExporter === 'latest' ? undefined : config.versions.blackboxExporter,
        targetNamespace: namespace,
        failurePolicy: HELM_CHART_FAILURE_POLICY,
        valuesContent: `fullnameOverride: ${EXPORTER}
priorityClassName: ${config.priorityClasses.capture}
resources:
  requests:
    cpu: 10m
    memory: 32Mi
  limits:
    memory: 128Mi
config:
  modules:
    http_2xx:
      prober: http
      timeout: 10s
      http:
        preferred_ip_protocol: ip4
        follow_redirects: true
    tls_connect:
      prober: tcp
      timeout: 10s
      tcp:
        preferred_ip_protocol: ip4
        tls: true
`,
      },
    });

    const probeLabels = { ...labels, release: 'kube-prometheus-stack' };
    const probe = (name: string, module: string, targets: string[]) => {
      if (targets.length === 0) return;
      new Probe(this, name, {
        metadata: { name, namespace, labels: probeLabels },
        spec: {
          prober: { url: `${EXPORTER}.${namespace}.svc:9115` },
          module,
          interval: '60s',
          scrapeTimeout: '15s',
          targets: { staticConfig: { static: targets } },
        },
      });
    };
    probe('blackbox-http', 'http_2xx', blackbox.httpTargets);
    probe('blackbox-tls', 'tls_connect', blackbox.tlsTargets);

    if (!blackbox.alerts) return;

    const certLeft = 'probe_ssl_earliest_cert_expiry - time()';
    new PrometheusRule(this, 'blackbox-rules', {
      metadata: { name: 'blackbox', namespace, labels: probeLabels },
      spec: {
        groups: [
          {
            name: 'blackbox',
            rules: [
              {
                alert: 'BlackboxProbeFailed',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString('probe_success == 0'),
                for: '5m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'Probe of {{ $labels.instance }} fails',
                  description:
                    'The blackbox exporter cannot reach {{ $labels.instance }} with a valid answer and certificate ({{ $labels.job }}). ' +
                    'Becomes critical as BlackboxProbeDown after 15 minutes.',
                },
              },
              {
                alert: 'BlackboxProbeDown',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString('probe_success == 0'),
                for: '15m',
                labels: { severity: 'critical' },
                annotations: {
                  summary: '{{ $labels.instance }} has been unreachable for 15 minutes',
                  description: 'The blackbox exporter cannot reach {{ $labels.instance }} with a valid answer and certificate ({{ $labels.job }}).',
                },
              },
              {
                alert: 'BlackboxCertificateExpiringSoon',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(`${certLeft} < ${blackbox.certWarningDays * DAY}`),
                for: '1h',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'Certificate of {{ $labels.instance }} expires in {{ $value | humanizeDuration }}',
                  description: 'The certificate served at {{ $labels.instance }} is not renewed in time.',
                },
              },
              {
                alert: 'BlackboxCertificateExpiring',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(`${certLeft} < ${7 * DAY}`),
                for: '1h',
                labels: { severity: 'critical' },
                annotations: {
                  summary: 'Certificate of {{ $labels.instance }} expires in {{ $value | humanizeDuration }}',
                  description: 'The certificate served at {{ $labels.instance }} expires within a week.',
                },
              },
              {
                // Without results the rules above can never fire.
                alert: 'BlackboxProbesAbsent',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString('absent(probe_success)'),
                for: '15m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'No blackbox probe results',
                  description: `Prometheus has no probe_success for >15m. Check the ${EXPORTER} deployment and the Probe resources in ${namespace}.`,
                },
              },
            ],
          },
        ],
      },
    });
  }
}
