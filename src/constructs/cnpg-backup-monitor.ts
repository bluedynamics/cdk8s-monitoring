import { Construct } from 'constructs';
import { PrometheusRule, PrometheusRuleSpecGroupsRulesExpr } from '../imports/monitoring.coreos.com';
import { CnpgBackupsConfig } from '../types';

export interface CnpgBackupMonitorProps {
  /** Namespace the monitoring stack lives in (where the PrometheusRule goes). */
  readonly monitoringNamespace: string;
  /** CNPG backup alert config (maximum age of the last base backup). */
  readonly cnpgBackups: CnpgBackupsConfig;
}

/** Metric prefix of the ObjectStore series kube-state-metrics exports (see PrometheusStackConstruct). */
export const OBJECTSTORE_METRIC_PREFIX = 'kube_barmancloud_objectstore';

// CNPG metrics carry no cluster label of their own in the TSDB; instance pods are named <cluster>-<serial>.
const withCnpgCluster = (expr: string) => `label_replace(${expr}, "cnpg_cluster", "$1", "pod", "(.+)-[0-9]+")`;

/**
 * Generic, opt-in alerts for CloudNativePG clusters backed up by the
 * barman-cloud plugin.
 *
 * Base backups: the plugin's own last_available_backup_timestamp metric only
 * appears on instances whose instance manager started after the plugin gained
 * metrics, and cnpg_collector_last_available_backup_timestamp stays 0 with the
 * plugin. The barman ObjectStore status is reliable for every cluster
 * (serverRecoveryWindow.<cluster>.lastSuccessfulBackupTime /
 * lastFailedBackupTime); kube-state-metrics exports it (cnpgBackups in
 * PrometheusStackConstruct).
 *
 * WAL archiving: pg_stat_archiver from CNPG's default monitoring queries. The
 * time since the last archival is no signal, because an idle database archives
 * nothing for hours; a failure newer than the last success and .ready files
 * piling up are.
 */
export class CnpgBackupMonitorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: CnpgBackupMonitorProps) {
    super(scope, id);
    const { monitoringNamespace, cnpgBackups } = props;
    const maxAgeSeconds = cnpgBackups.maxAgeHours * 3600;

    const lastSuccessful = `max by (namespace, cnpg_cluster, objectstore) (${OBJECTSTORE_METRIC_PREFIX}_last_successful_backup_time)`;
    const lastFailed = `max by (namespace, cnpg_cluster, objectstore) (${OBJECTSTORE_METRIC_PREFIX}_last_failed_backup_time)`;
    // A cluster without a running instance (hibernated, scaled down) takes no backups and changes no data.
    const running = `count by (namespace, cnpg_cluster) (${withCnpgCluster('cnpg_collector_up')})`;
    const objectStoreStatus =
      "kubectl -n {{ $labels.namespace }} get objectstores.barmancloud.cnpg.io {{ $labels.objectstore }} -o jsonpath='{.status}'";

    new PrometheusRule(this, 'cnpg-backup-rules', {
      metadata: {
        name: 'cnpg-backups',
        namespace: monitoringNamespace,
        labels: {
          'app.kubernetes.io/name': 'cnpg',
          'app.kubernetes.io/component': 'database',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
          'release': 'kube-prometheus-stack',
        },
      },
      spec: {
        groups: [
          {
            name: 'cnpg.backups',
            rules: [
              {
                alert: 'CnpgBackupStale',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                  `(time() - ${lastSuccessful} > ${maxAgeSeconds}) and on (namespace, cnpg_cluster) ${running}`,
                ),
                for: '15m',
                labels: { severity: 'warning' },
                annotations: {
                  // A missing lastSuccessfulBackupTime is exported as 0; its age since 1970 is no useful duration.
                  summary:
                    'CNPG {{ $labels.namespace }}/{{ $labels.cnpg_cluster }} ' +
                    '{{ if gt $value 1000000000.0 }}has never been backed up{{ else }}has no base backup for {{ $value | humanizeDuration }}{{ end }}',
                  description:
                    `The last successful barman base backup is older than ${cnpgBackups.maxAgeHours}h. ` +
                    'Check the ScheduledBackup and the latest backups (kubectl get backups.postgresql.cnpg.io; ' +
                    `plain "kubectl get backup" lists Longhorn backups). ObjectStore: ${objectStoreStatus}`,
                },
              },
              {
                alert: 'CnpgBackupFailed',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(`${lastFailed} > ${lastSuccessful}`),
                for: '5m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'CNPG {{ $labels.namespace }}/{{ $labels.cnpg_cluster }}: last base backup failed',
                  description:
                    'The most recent barman base backup attempt failed; the previous successful one is older. ' +
                    'kubectl -n {{ $labels.namespace }} get backups.postgresql.cnpg.io shows the error. ' +
                    `ObjectStore: ${objectStoreStatus}`,
                },
              },
              {
                alert: 'CnpgWalArchivingFailing',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                  'max by (namespace, pod) (cnpg_pg_stat_archiver_last_failed_time > cnpg_pg_stat_archiver_last_archived_time)' +
                    ' and on (namespace, pod) (cnpg_pg_replication_in_recovery == 0)',
                ),
                for: '15m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'CNPG {{ $labels.namespace }}/{{ $labels.pod }}: WAL archiving fails',
                  description:
                    'The primary failed to archive WAL more recently than it succeeded. Point-in-time recovery has a gap ' +
                    'from here on, and unarchived WAL stays on the volume until it is full. ' +
                    'Log: kubectl -n {{ $labels.namespace }} logs {{ $labels.pod }} -c plugin-barman-cloud',
                },
              },
              {
                alert: 'CnpgWalArchiveBacklog',
                expr: PrometheusRuleSpecGroupsRulesExpr.fromString(
                  'max by (namespace, pod) (cnpg_collector_pg_wal_archive_status{value="ready"}) > 10',
                ),
                for: '30m',
                labels: { severity: 'warning' },
                annotations: {
                  summary: 'CNPG {{ $labels.namespace }}/{{ $labels.pod }}: {{ $value }} WAL files wait for archiving',
                  description:
                    'WAL segments pile up in pg_wal/archive_status as .ready, so archiving hangs or cannot keep up, ' +
                    'even if it reports no error. The volume fills up until PostgreSQL stops. ' +
                    'Log: kubectl -n {{ $labels.namespace }} logs {{ $labels.pod }} -c plugin-barman-cloud',
                },
              },
            ],
          },
        ],
      },
    });
  }
}
