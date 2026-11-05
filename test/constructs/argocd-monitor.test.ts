import { Testing } from 'cdk8s';
import { ArgoCdMonitorConstruct } from '../../src/constructs/argocd-monitor';
import { createTestConfig, synthesizeChart, findResource, expectLabels } from '../helpers';

describe('ArgoCdMonitorConstruct', () => {
  it('creates a PodMonitor scraping the application controller on the metrics port', () => {
    const chart = Testing.chart();
    const { argocd } = createTestConfig();
    new ArgoCdMonitorConstruct(chart, 'test-argocd', {
      monitoringNamespace: 'monitoring',
      argocd: { ...argocd, enabled: true },
    });
    const pm = findResource(synthesizeChart(chart), 'PodMonitor', 'argocd-application-controller');
    expect(pm.metadata.namespace).toBe('monitoring');
    expect(pm.spec.selector.matchLabels['app.kubernetes.io/name']).toBe('argocd-application-controller');
    expect(pm.spec.namespaceSelector.matchNames).toEqual(['argocd']);
    expect(pm.spec.podMetricsEndpoints[0]).toMatchObject({ port: 'metrics', path: '/metrics' });
    expectLabels(pm, { release: 'kube-prometheus-stack' });
  });

  it('alerts on applications whose sync status is Unknown and on missing ArgoCD metrics', () => {
    const chart = Testing.chart();
    const { argocd } = createTestConfig();
    new ArgoCdMonitorConstruct(chart, 'test-argocd', {
      monitoringNamespace: 'monitoring',
      argocd: { ...argocd, enabled: true, alerts: true },
    });
    const rule = findResource(synthesizeChart(chart), 'PrometheusRule', 'argocd-gitops');
    const rules = rule.spec.groups[0].rules;
    const unknown = rules.find((r: any) => r.alert === 'ArgoCdAppSyncUnknown');
    const absent = rules.find((r: any) => r.alert === 'ArgoCdMetricsAbsent');
    expect(unknown.expr).toBe('argocd_app_info{sync_status="Unknown"}');
    expect(unknown.for).toBe('15m');
    expect(unknown.labels.severity).toBe('warning');
    expect(absent.expr).toBe('absent(argocd_app_info)');
    expect(absent.labels.severity).toBe('warning');
  });

  it('omits the PrometheusRule when alerts=false', () => {
    const chart = Testing.chart();
    const { argocd } = createTestConfig();
    new ArgoCdMonitorConstruct(chart, 'test-argocd', {
      monitoringNamespace: 'monitoring',
      argocd: { ...argocd, enabled: true, alerts: false },
    });
    expect(findResource(synthesizeChart(chart), 'PrometheusRule', 'argocd-gitops')).toBeUndefined();
  });
});
