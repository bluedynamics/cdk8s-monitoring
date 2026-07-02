import { Construct } from 'constructs';
import {
  PrometheusRule,
  PrometheusRuleSpecGroupsRulesExpr,
  ServiceMonitor,
} from '../imports/monitoring.coreos.com';
import { LonghornConfig } from '../types';

export interface LonghornMonitorProps {
  /** Namespace the monitoring stack lives in (where the ServiceMonitor/PrometheusRule go). */
  readonly monitoringNamespace: string;
  /** Longhorn config (namespace it runs in + alerts toggle). */
  readonly longhorn: LonghornConfig;
}

/**
 * Generic, opt-in monitor for Longhorn distributed storage.
 *
 * ServiceMonitor scrapes the longhorn-manager metrics (port `manager`, 9500):
 * volume/node/storage-pool health and capacity.
 *
 * Optionally ships volume-health alerts (config.longhorn.alerts). Motivated by a
 * real incident (2026-05-21): a CNPG replica PVC went detached/unknown with no
 * alert; noticed only 2h later via a downstream CNPG error. These rules surface
 * storage health within minutes.
 *
 * longhorn_volume_robustness: 0=unknown, 1=healthy, 2=degraded, 3=faulted.
 */
export class LonghornMonitorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: LonghornMonitorProps) {
    super(scope, id);
    const { monitoringNamespace, longhorn } = props;

    const labels = {
      'app.kubernetes.io/name': 'longhorn',
      'app.kubernetes.io/component': 'storage',
      'app.kubernetes.io/managed-by': 'cdk8s',
      'app.kubernetes.io/part-of': 'monitoring',
      'release': 'kube-prometheus-stack',
    };

    new ServiceMonitor(this, 'longhorn-metrics', {
      metadata: { name: 'longhorn-metrics', namespace: monitoringNamespace, labels },
      spec: {
        selector: { matchLabels: { app: 'longhorn-manager' } },
        namespaceSelector: { matchNames: [longhorn.namespace] },
        endpoints: [
          { port: 'manager', path: '/metrics', interval: '30s', scrapeTimeout: '10s' },
        ],
      },
    });

    if (longhorn.alerts) {
      new PrometheusRule(this, 'longhorn-volume-health-rules', {
        metadata: { name: 'longhorn-volume-health', namespace: monitoringNamespace, labels },
        spec: {
          groups: [
            {
              name: 'longhorn.volume-health',
              rules: [
                {
                  alert: 'LonghornVolumeFaulted',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString('longhorn_volume_robustness == 3'),
                  for: '1m',
                  labels: { severity: 'critical' },
                  annotations: {
                    summary: 'Longhorn volume {{ $labels.volume }} is faulted',
                    description:
                      'Volume {{ $labels.volume }} (node={{ $labels.node }}, pvc={{ $labels.pvc }}) is in faulted state. ' +
                      'Data may be lost. Recovery: scale workload down, delete PVC, scale up so the StatefulSet/operator re-creates and re-syncs from a healthy source.',
                  },
                },
                {
                  alert: 'LonghornVolumeUnhealthy',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                    'longhorn_volume_robustness == 0 or longhorn_volume_robustness == 2',
                  ),
                  for: '10m',
                  labels: { severity: 'warning' },
                  annotations: {
                    summary: 'Longhorn volume {{ $labels.volume }} not healthy (robustness={{ $value }})',
                    description:
                      'Volume {{ $labels.volume }} (node={{ $labels.node }}, pvc={{ $labels.pvc }}) has been non-healthy for >10m. ' +
                      'robustness values: 0=unknown, 2=degraded. A short degraded window during a replica rebuild is normal; 10m+ means manual investigation.',
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
