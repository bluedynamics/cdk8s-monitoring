import { Testing } from 'cdk8s';
import { CnpgBackupMonitorConstruct } from '../../src/constructs/cnpg-backup-monitor';
import { synthesizeChart, findResource, expectLabels } from '../helpers';

describe('CnpgBackupMonitorConstruct', () => {
  const synthRules = (maxAgeHours = 30) => {
    const chart = Testing.chart();
    new CnpgBackupMonitorConstruct(chart, 'test-cnpg', {
      monitoringNamespace: 'monitoring',
      cnpgBackups: { enabled: true, maxAgeHours },
    });
    return findResource(synthesizeChart(chart), 'PrometheusRule', 'cnpg-backups');
  };
  const rule = (name: string, maxAgeHours?: number) =>
    synthRules(maxAgeHours).spec.groups[0].rules.find((r: any) => r.alert === name);
  const running =
    'count by (namespace, cnpg_cluster) (label_replace(cnpg_collector_up, "cnpg_cluster", "$1", "pod", "(.+)-[0-9]+"))';
  const lastOk = 'max by (namespace, cnpg_cluster, objectstore) (kube_barmancloud_objectstore_last_successful_backup_time)';
  const lastFailed = 'max by (namespace, cnpg_cluster, objectstore) (kube_barmancloud_objectstore_last_failed_backup_time)';

  it('creates the PrometheusRule in the monitoring namespace', () => {
    const prometheusRule = synthRules();
    expect(prometheusRule.metadata.namespace).toBe('monitoring');
    expectLabels(prometheusRule, { release: 'kube-prometheus-stack' });
  });

  it('alerts when the last base backup of a running cluster is older than maxAgeHours', () => {
    const stale = rule('CnpgBackupStale', 30);
    expect(stale.expr).toBe(`(time() - ${lastOk} > 108000) and on (namespace, cnpg_cluster) ${running}`);
    expect(stale.labels.severity).toBe('warning');
    expect(stale.annotations.summary).toContain('{{ if gt $value 1000000000.0 }}has never been backed up{{ else }}');
  });

  it('alerts when the last base backup attempt failed', () => {
    const failed = rule('CnpgBackupFailed');
    expect(failed.expr).toBe(`${lastFailed} > ${lastOk}`);
    expect(failed.labels.severity).toBe('warning');
  });

  it('alerts when WAL archiving fails on a primary', () => {
    const archiving = rule('CnpgWalArchivingFailing');
    expect(archiving.expr).toBe(
      'max by (namespace, pod) (cnpg_pg_stat_archiver_last_failed_time > cnpg_pg_stat_archiver_last_archived_time)'
      + ' and on (namespace, pod) (cnpg_pg_replication_in_recovery == 0)',
    );
    expect(archiving.labels.severity).toBe('warning');
  });

  it('alerts when WAL files pile up waiting for archiving', () => {
    const backlog = rule('CnpgWalArchiveBacklog');
    expect(backlog.expr).toBe('max by (namespace, pod) (cnpg_collector_pg_wal_archive_status{value="ready"}) > 10');
    expect(backlog.labels.severity).toBe('warning');
  });
});
