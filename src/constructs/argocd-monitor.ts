import { Construct } from 'constructs';
import {
  PodMonitor,
  PrometheusRule,
  PrometheusRuleSpecGroupsRulesExpr,
} from '../imports/monitoring.coreos.com';
import { ArgoCdConfig } from '../types';

export interface ArgoCdMonitorProps {
  /** Namespace the monitoring stack lives in (where the PodMonitor/PrometheusRule go). */
  readonly monitoringNamespace: string;
  /** ArgoCD config (namespace it runs in + alerts toggle). */
  readonly argocd: ArgoCdConfig;
}

/**
 * Generic, opt-in monitor for ArgoCD.
 *
 * Uses a PodMonitor (not a ServiceMonitor): the argo-helm chart creates the
 * application-controller metrics Service only with controller.metrics.enabled,
 * while the `metrics` port (8082) is always on the Pod.
 *
 * Optionally ships GitOps alerts (config.argocd.alerts). Motivated by a real
 * incident (2026-07-21): an expired repository token left every application
 * `Unknown` + `Healthy` for 24h. Nothing alerted, because the workloads kept
 * running; only deployments silently stopped.
 *
 * A failed comparison (ComparisonError: repository unreachable, credentials
 * rejected, manifest generation failing) sets the sync status to `Unknown`, so
 * `argocd_app_info{sync_status="Unknown"}` covers it without the opt-in
 * `argocd_app_condition` metric.
 */
export class ArgoCdMonitorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ArgoCdMonitorProps) {
    super(scope, id);
    const { monitoringNamespace, argocd } = props;

    const labels = {
      'app.kubernetes.io/name': 'argocd',
      'app.kubernetes.io/component': 'gitops',
      'app.kubernetes.io/managed-by': 'cdk8s',
      'app.kubernetes.io/part-of': 'monitoring',
      'release': 'kube-prometheus-stack',
    };

    new PodMonitor(this, 'argocd-application-controller', {
      metadata: { name: 'argocd-application-controller', namespace: monitoringNamespace, labels },
      spec: {
        selector: { matchLabels: { 'app.kubernetes.io/name': 'argocd-application-controller' } },
        namespaceSelector: { matchNames: [argocd.namespace] },
        podMetricsEndpoints: [
          { port: 'metrics', path: '/metrics', interval: '30s', scrapeTimeout: '10s' },
        ],
      },
    });

    if (argocd.alerts) {
      new PrometheusRule(this, 'argocd-gitops-rules', {
        metadata: { name: 'argocd-gitops', namespace: monitoringNamespace, labels },
        spec: {
          groups: [
            {
              name: 'argocd.gitops',
              rules: [
                {
                  // 15m outlasts a few refresh cycles (default 3m), so a single
                  // failed Git fetch does not page.
                  alert: 'ArgoCdAppSyncUnknown',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString('argocd_app_info{sync_status="Unknown"}'),
                  for: '15m',
                  labels: { severity: 'warning' },
                  annotations: {
                    summary: 'ArgoCD cannot compare application {{ $labels.name }} with Git',
                    description:
                      'Application {{ $labels.name }} (project {{ $labels.project }}) has had sync status Unknown for >15m. ' +
                      'ArgoCD no longer deploys changes to it; the running workload is untouched. ' +
                      'Usual causes: repository credentials expired or revoked, repository unreachable, manifest generation failing. ' +
                      'Check: kubectl -n {{ $labels.namespace }} get application {{ $labels.name }} -o jsonpath=\'{.status.conditions}\'',
                  },
                },
                {
                  // Without metrics the rule above can never fire.
                  alert: 'ArgoCdMetricsAbsent',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString('absent(argocd_app_info)'),
                  for: '15m',
                  labels: { severity: 'warning' },
                  annotations: {
                    summary: 'No ArgoCD application metrics',
                    description:
                      'Prometheus has scraped no argocd_app_info for >15m, so ArgoCdAppSyncUnknown cannot fire. ' +
                      `Check the application controller in namespace ${argocd.namespace} and the PodMonitor argocd-application-controller.`,
                  },
                },
              ],
            },
          ],
        },
      });
    }
  }
}
