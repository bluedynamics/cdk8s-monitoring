import { Testing } from 'cdk8s';
import { TraefikMonitorConstruct } from '../../src/constructs/traefik-monitor';
import { createTestConfig, synthesizeChart, findResource, expectLabels } from '../helpers';

describe('TraefikMonitorConstruct', () => {
  it('creates a PodMonitor (not ServiceMonitor) scraping the traefik metrics port in the traefik namespace', () => {
    const chart = Testing.chart();
    const { traefik } = createTestConfig();
    new TraefikMonitorConstruct(chart, 'test-traefik', {
      monitoringNamespace: 'monitoring',
      traefik: { ...traefik, enabled: true },
    });
    const manifests = synthesizeChart(chart);

    expect(findResource(manifests, 'ServiceMonitor')).toBeUndefined();
    const pm = findResource(manifests, 'PodMonitor', 'traefik-metrics');
    expect(pm.metadata.namespace).toBe('monitoring');
    expect(pm.spec.selector.matchLabels['app.kubernetes.io/name']).toBe('traefik');
    expect(pm.spec.namespaceSelector.matchNames).toEqual(['traefik']);
    expect(pm.spec.podMetricsEndpoints[0]).toMatchObject({ port: 'metrics', path: '/metrics' });
    expectLabels(pm, { release: 'kube-prometheus-stack' });
  });

  it('honours a custom traefik namespace', () => {
    const chart = Testing.chart();
    const { traefik } = createTestConfig();
    new TraefikMonitorConstruct(chart, 'test-traefik', {
      monitoringNamespace: 'monitoring',
      traefik: { ...traefik, enabled: true, namespace: 'ingress' },
    });
    const pm = findResource(synthesizeChart(chart), 'PodMonitor', 'traefik-metrics');
    expect(pm.spec.namespaceSelector.matchNames).toEqual(['ingress']);
  });

  it('ships the Grafana dashboard ConfigMap (sidecar-labelled) when dashboard=true', () => {
    const chart = Testing.chart();
    const { traefik } = createTestConfig();
    new TraefikMonitorConstruct(chart, 'test-traefik', {
      monitoringNamespace: 'monitoring',
      traefik: { ...traefik, enabled: true, dashboard: true },
    });
    const cm = findResource(synthesizeChart(chart), 'ConfigMap', 'traefik-dashboard');
    expect(cm).toBeDefined();
    expectLabels(cm, { grafana_dashboard: '1' });
    expect(cm.data['traefik.json']).toContain('"title"');
  });

  it('omits the dashboard ConfigMap when dashboard=false', () => {
    const chart = Testing.chart();
    const { traefik } = createTestConfig();
    new TraefikMonitorConstruct(chart, 'test-traefik', {
      monitoringNamespace: 'monitoring',
      traefik: { ...traefik, enabled: true, dashboard: false },
    });
    expect(findResource(synthesizeChart(chart), 'ConfigMap', 'traefik-dashboard')).toBeUndefined();
  });
});
