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
