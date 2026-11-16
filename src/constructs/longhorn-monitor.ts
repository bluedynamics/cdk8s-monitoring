import { Construct } from 'constructs';
import {
  PrometheusRule,
  PrometheusRuleSpecGroupsRulesExpr,
  ServiceMonitor,
} from '../imports/monitoring.coreos.com';
import { LonghornBackupAlertsConfig, LonghornConfig } from '../types';

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
 * longhorn_volume_robustness and longhorn_volume_state export one series per
 * state (label `state`); the current state has value 1, every other 0
 * (Longhorn 1.13). Comparing the value against 0..3 matches nothing useful.
 * A detached volume always reports robustness `unknown`, so `unknown` counts
 * only while the volume is attached.
 *
 * Optionally ships backup alerts (config.longhorn.backupAlerts), see
 * staleBackupExpr. longhorn_backup_state, unlike the two above, is a single
 * number: 0=New, 1=Pending, 2=InProgress, 3=Completed, 4=Error, 5=Unknown.
 * Longhorn deletes a failed backup after the setting failed-backup-ttl
 * (default 24h); from then on only the stale-backup rule still fires.
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
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString('longhorn_volume_robustness{state="faulted"} == 1'),
                  for: '1m',
                  labels: { severity: 'critical' },
                  annotations: {
                    summary: 'Longhorn volume {{ $labels.volume }} is faulted',
                    description:
                      'Volume {{ $labels.volume }} (node={{ $labels.node }}, pvc={{ $labels.pvc_namespace }}/{{ $labels.pvc }}) is in faulted state. ' +
                      'Data may be lost. Recovery: scale workload down, delete PVC, scale up so the StatefulSet/operator re-creates and re-syncs from a healthy source.',
                  },
                },
                {
                  alert: 'LonghornVolumeUnhealthy',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                    'longhorn_volume_robustness{state="degraded"} == 1 or '
                    + '(longhorn_volume_robustness{state="unknown"} == 1 and on (volume) longhorn_volume_state{state="attached"} == 1)',
                  ),
                  for: '10m',
                  labels: { severity: 'warning' },
                  annotations: {
                    summary: 'Longhorn volume {{ $labels.volume }} not healthy (robustness {{ $labels.state }})',
                    description:
                      'Volume {{ $labels.volume }} (node={{ $labels.node }}, pvc={{ $labels.pvc_namespace }}/{{ $labels.pvc }}) has been non-healthy for >10m. ' +
                      'Degraded means fewer healthy replicas than configured; unknown on an attached volume means Longhorn has lost track of it. ' +
                      'A short degraded window during a replica rebuild is normal; 10m+ means manual investigation.',
                  },
                },
              ],
            },
          ],
        },
      });
    }

    if (longhorn.backupAlerts.enabled) {
      new PrometheusRule(this, 'longhorn-backup-rules', {
        metadata: { name: 'longhorn-backups', namespace: monitoringNamespace, labels },
        spec: {
          groups: [
            {
              name: 'longhorn.backups',
              rules: [
                {
                  alert: 'LonghornBackupFailed',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                    'max by (volume, backup, recurring_job) (longhorn_backup_state) == 4',
                  ),
                  for: '5m',
                  labels: { severity: 'warning' },
                  annotations: {
                    summary: 'Longhorn backup {{ $labels.backup }} of volume {{ $labels.volume }} failed',
                    description:
                      'Backup {{ $labels.backup }} (recurring job "{{ $labels.recurring_job }}") of volume {{ $labels.volume }} is in state Error. ' +
                      `Reason: kubectl -n ${longhorn.namespace} get backups.longhorn.io {{ $labels.backup }} -o jsonpath='{.status.error}'. ` +
                      'The live data is untouched; the next run retries.',
                  },
                },
                {
                  alert: 'LonghornVolumeBackupStale',
                  expr: PrometheusRuleSpecGroupsRulesExpr.fromString(staleBackupExpr(longhorn.backupAlerts)),
                  for: '15m',
                  labels: { severity: 'warning' },
                  annotations: {
                    summary: 'Longhorn volume {{ $labels.pvc_namespace }}/{{ $labels.pvc }} has no backup for {{ $value | humanizeDuration }}',
                    description:
                      `Volume {{ $labels.volume }} is attached and its last backup is older than ${longhorn.backupAlerts.maxAgeHours}h, or it has never been backed up. ` +
                      'Check the recurring backup job and the backup target. ' +
                      'If the volume needs no backup, put its PVC into an exempt recurring-job group.',
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

/** PVC label that puts a volume into a Longhorn recurring-job group. */
export function longhornGroupPvcLabel(group: string): string {
  return `recurring-job-group.longhorn.io/${group}`;
}

/** A Kubernetes label as kube-state-metrics names it on kube_*_labels. */
function ksmLabelName(label: string): string {
  return `label_${label.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Attached volumes whose last backup is older than maxAgeHours, or that have
 * never been backed up (last_backup_at 0).
 *
 * Detached volumes are skipped: Longhorn does not back them up by default
 * (allow-recurring-job-while-volume-detached), and their data cannot change.
 * PVCs of an exempt group and PVCs younger than maxAgeHours (no scheduled run
 * yet) are skipped by joining kube-state-metrics' PVC series onto the
 * pvc_namespace/pvc labels of the Longhorn metric.
 */
function staleBackupExpr(backupAlerts: LonghornBackupAlertsConfig): string {
  const maxAgeSeconds = backupAlerts.maxAgeHours * 3600;
  const skipped = [
    ...backupAlerts.exemptGroups.map(
      (group) => `kube_persistentvolumeclaim_labels{${ksmLabelName(longhornGroupPvcLabel(group))}="enabled"}`,
    ),
    `(time() - kube_persistentvolumeclaim_created < ${maxAgeSeconds})`,
  ].join(' or ');
  return (
    `(max by (volume, pvc, pvc_namespace) (time() - longhorn_volume_last_backup_at) > ${maxAgeSeconds}` +
    ' and on (volume) longhorn_volume_state{state="attached"} == 1)' +
    ' unless on (pvc_namespace, pvc) label_replace(label_replace(' +
    skipped +
    ', "pvc_namespace", "$1", "namespace", "(.+)"), "pvc", "$1", "persistentvolumeclaim", "(.+)")'
  );
}
