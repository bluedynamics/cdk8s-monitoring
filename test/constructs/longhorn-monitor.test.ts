import { Testing } from 'cdk8s';
import { LonghornMonitorConstruct } from '../../src/constructs/longhorn-monitor';
import { createTestConfig, synthesizeChart, findResource, expectLabels } from '../helpers';

describe('LonghornMonitorConstruct', () => {
  it('creates a ServiceMonitor scraping longhorn-manager on the manager port', () => {
    const chart = Testing.chart();
    const { longhorn } = createTestConfig();
    new LonghornMonitorConstruct(chart, 'test-longhorn', {
      monitoringNamespace: 'monitoring',
      longhorn: { ...longhorn, enabled: true },
    });
    const sm = findResource(synthesizeChart(chart), 'ServiceMonitor', 'longhorn-metrics');
    expect(sm.metadata.namespace).toBe('monitoring');
    expect(sm.spec.selector.matchLabels.app).toBe('longhorn-manager');
    expect(sm.spec.namespaceSelector.matchNames).toEqual(['longhorn-system']);
    expect(sm.spec.endpoints[0]).toMatchObject({ port: 'manager', path: '/metrics' });
    expectLabels(sm, { release: 'kube-prometheus-stack' });
  });

  it('creates volume-health alert rules on the labeled robustness series when alerts=true', () => {
    const chart = Testing.chart();
    const { longhorn } = createTestConfig();
    new LonghornMonitorConstruct(chart, 'test-longhorn', {
      monitoringNamespace: 'monitoring',
      longhorn: { ...longhorn, enabled: true, alerts: true },
    });
    const rule = findResource(synthesizeChart(chart), 'PrometheusRule', 'longhorn-volume-health');
    expect(rule).toBeDefined();
    const rules = rule.spec.groups[0].rules;
    const faulted = rules.find((r: any) => r.alert === 'LonghornVolumeFaulted');
    const unhealthy = rules.find((r: any) => r.alert === 'LonghornVolumeUnhealthy');
    // Longhorn exports one series per state (label `state`), 1 for the current one.
    expect(faulted.expr).toBe('longhorn_volume_robustness{state="faulted"} == 1');
    expect(faulted.labels.severity).toBe('critical');
    // A detached volume always reports robustness unknown, so unknown counts only while attached.
    expect(unhealthy.expr).toBe(
      'longhorn_volume_robustness{state="degraded"} == 1 or '
      + '(longhorn_volume_robustness{state="unknown"} == 1 and on (volume) longhorn_volume_state{state="attached"} == 1)',
    );
    expect(unhealthy.labels.severity).toBe('warning');
    expect(unhealthy.for).toBe('10m');
  });

  it('omits the PrometheusRule when alerts=false', () => {
    const chart = Testing.chart();
    const { longhorn } = createTestConfig();
    new LonghornMonitorConstruct(chart, 'test-longhorn', {
      monitoringNamespace: 'monitoring',
      longhorn: { ...longhorn, enabled: true, alerts: false },
    });
    expect(findResource(synthesizeChart(chart), 'PrometheusRule', 'longhorn-volume-health')).toBeUndefined();
  });
});

describe('LonghornMonitorConstruct backup alerts', () => {
  const synthBackupRules = (backupAlerts: object, alerts = true) => {
    const chart = Testing.chart();
    const { longhorn } = createTestConfig();
    new LonghornMonitorConstruct(chart, 'test-longhorn', {
      monitoringNamespace: 'monitoring',
      longhorn: { ...longhorn, enabled: true, alerts, backupAlerts: { ...longhorn.backupAlerts, ...backupAlerts } },
    });
    return findResource(synthesizeChart(chart), 'PrometheusRule', 'longhorn-backups');
  };
  const backupRule = (rule: any, name: string) => rule.spec.groups[0].rules.find((r: any) => r.alert === name);

  it('omits the backup rules unless backupAlerts.enabled', () => {
    expect(synthBackupRules({ enabled: false })).toBeUndefined();
  });

  it('ships the backup rules independently of the volume-health alerts', () => {
    expect(synthBackupRules({ enabled: true }, false)).toBeDefined();
  });

  it('alerts on a backup in state Error (4)', () => {
    const failed = backupRule(synthBackupRules({ enabled: true }), 'LonghornBackupFailed');
    expect(failed.expr).toBe('max by (volume, backup, recurring_job) (longhorn_backup_state) == 4');
    expect(failed.labels.severity).toBe('warning');
  });

  it('alerts on attached volumes whose last backup is too old, skipping exempt groups and young PVCs', () => {
    const stale = backupRule(
      synthBackupRules({ enabled: true, maxAgeHours: 30, exemptGroups: ['no-backup'] }),
      'LonghornVolumeBackupStale',
    );
    expect(stale.expr).toBe(
      '(max by (volume, pvc, pvc_namespace) (time() - longhorn_volume_last_backup_at) > 108000'
      + ' and on (volume) longhorn_volume_state{state="attached"} == 1)'
      + ' unless on (pvc_namespace, pvc) label_replace(label_replace('
      + 'kube_persistentvolumeclaim_labels{label_recurring_job_group_longhorn_io_no_backup="enabled"}'
      + ' or (time() - kube_persistentvolumeclaim_created < 108000)'
      + ', "pvc_namespace", "$1", "namespace", "(.+)"), "pvc", "$1", "persistentvolumeclaim", "(.+)")',
    );
    expect(stale.labels.severity).toBe('warning');
  });

  it('skips only young PVCs when no group is exempt', () => {
    const stale = backupRule(synthBackupRules({ enabled: true }), 'LonghornVolumeBackupStale');
    expect(stale.expr).toContain('label_replace(label_replace((time() - kube_persistentvolumeclaim_created < 108000), ');
    expect(stale.expr).not.toContain('kube_persistentvolumeclaim_labels');
  });
});
