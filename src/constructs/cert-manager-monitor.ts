import { Construct } from 'constructs';
import {
  PrometheusRule,
  PrometheusRuleSpecGroupsRulesExpr,
  ServiceMonitor,
  ServiceMonitorSpecEndpointsRelabelingsAction,
} from '../imports/monitoring.coreos.com';
import { CertManagerConfig } from '../types';

export interface CertManagerMonitorProps {
  /** Namespace the monitoring stack lives in (where the ServiceMonitor/PrometheusRule go). */
  readonly monitoringNamespace: string;
  /** cert-manager config (namespace it runs in + alerts toggle). */
  readonly certManager: CertManagerConfig;
}

const DAY = 86400;

/**
 * Generic, opt-in monitor for cert-manager.
 *
 * Automatic renewal makes an expired certificate unlikely, which is exactly why
 * a renewal that fails goes unnoticed: an HTTP-01 challenge broken by a routing
 * change, a rate limit, or a stuck controller. ACME certificates renew a third
 * of their lifetime before expiry (30 days for Let's Encrypt), and
 * certmanager_certificate_renewal_timestamp_seconds is that planned time, so a
 * renewal more than a day overdue is the earliest reliable signal; expiry within
 * 7 days is critical.
 *
 * honorLabels keeps the namespace of each Certificate instead of the
 * controller's. The job is fixed so CertManagerMetricsAbsent does not depend on
 * the Service name, and the pod labels are dropped so a controller restart does
 * not change the series.
 */
export class CertManagerMonitorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: CertManagerMonitorProps) {
    super(scope, id);
    const { monitoringNamespace, certManager } = props;

    const labels = {
      'app.kubernetes.io/name': 'cert-manager',
      'app.kubernetes.io/component': 'certificates',
      'app.kubernetes.io/managed-by': 'cdk8s',
      'app.kubernetes.io/part-of': 'monitoring',
      'release': 'kube-prometheus-stack',
    };

    new ServiceMonitor(this, 'cert-manager-metrics', {
      metadata: { name: 'cert-manager', namespace: monitoringNamespace, labels },
      spec: {
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'cert-manager',
            'app.kubernetes.io/component': 'controller',
          },
        },
        namespaceSelector: { matchNames: [certManager.namespace] },
        endpoints: [
          {
            port: 'http-metrics',
            path: '/metrics',
            interval: '60s',
            honorLabels: true,
            relabelings: [
              { targetLabel: 'job', replacement: 'cert-manager' },
              { action: ServiceMonitorSpecEndpointsRelabelingsAction.LABELDROP, regex: '(pod|container|endpoint|service)' },
              { targetLabel: 'instance', replacement: 'cert-manager' },
            ],
          },
        ],
      },
    });

    if (!certManager.alerts) return;

    const renewal = 'max by (namespace, name) (certmanager_certificate_renewal_timestamp_seconds)';
    const expiration = 'max by (namespace, name) (certmanager_certificate_expiration_timestamp_seconds)';
    const describe = (namespace = '{{ $labels.namespace }}') =>
      `kubectl -n ${namespace} describe certificate {{ $labels.name }} shows the condition; ` +
      `kubectl -n ${namespace} get certificaterequests,orders,challenges shows where issuance stops.`;

    new PrometheusRule(this, 'cert-manager-rules', {
      metadata: { name: 'cert-manager', namespace: monitoringNamespace, labels },
      spec: {
        groups: [
          {
            name: 'cert-manager',
            rules: [
              {
                alert: 'CertManagerCertificateNotReady',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                  'max by (namespace, name) (certmanager_certificate_ready_status{condition!="True"}) == 1',
                ),
                for: '30m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'Certificate {{ $labels.namespace }}/{{ $labels.name }} is not ready',
                  description: `cert-manager cannot issue a valid certificate for it. ${describe()}`,
                },
              },
              {
                alert: 'CertManagerCertificateRenewalOverdue',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                  `(time() - ${renewal} > ${DAY}) and ${renewal} > 0`,
                ),
                for: '15m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'Certificate {{ $labels.namespace }}/{{ $labels.name }}: renewal overdue by {{ $value | humanizeDuration }}',
                  description:
                    'The planned renewal time has passed and the certificate was not renewed; it stays valid until it expires. ' +
                    describe(),
                },
              },
              {
                alert: 'CertManagerCertificateExpiringSoon',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                  `(${expiration} - time() < ${7 * DAY}) and ${expiration} > 0`,
                ),
                for: '1h',
                labels: { severity: 'critical' },
                annotations: {
                  summary: 'Certificate {{ $labels.namespace }}/{{ $labels.name }} expires in {{ $value | humanizeDuration }}',
                  description: `Renewal has failed for weeks. ${describe()}`,
                },
              },
              {
                // Without metrics the rules above can never fire.
                alert: 'CertManagerMetricsAbsent',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString('absent(up{job="cert-manager"} == 1)'),
                for: '15m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'cert-manager is not scraped',
                  description:
                    'Prometheus has scraped no cert-manager controller for >15m, so the certificate alerts cannot fire. ' +
                    `Check the controller in namespace ${certManager.namespace} and the ServiceMonitor cert-manager.`,
                },
              },
            ],
          },
        ],
      },
    });
  }
}
