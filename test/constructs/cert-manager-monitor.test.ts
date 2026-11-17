import { Testing } from 'cdk8s';
import { CertManagerMonitorConstruct } from '../../src/constructs/cert-manager-monitor';
import { createTestConfig, synthesizeChart, findResource, expectLabels } from '../helpers';

describe('CertManagerMonitorConstruct', () => {
  const synth = (alerts = true) => {
    const chart = Testing.chart();
    const { certManager } = createTestConfig();
    new CertManagerMonitorConstruct(chart, 'test-cert-manager', {
      monitoringNamespace: 'monitoring',
      certManager: { ...certManager, enabled: true, alerts },
    });
    return synthesizeChart(chart);
  };
  const rule = (name: string) =>
    findResource(synth(), 'PrometheusRule', 'cert-manager').spec.groups[0].rules.find((r: any) => r.alert === name);

  it('scrapes the controller with stable labels and the namespace of each certificate', () => {
    const sm = findResource(synth(), 'ServiceMonitor', 'cert-manager');
    expect(sm.metadata.namespace).toBe('monitoring');
    expect(sm.spec.selector.matchLabels).toEqual({
      'app.kubernetes.io/name': 'cert-manager',
      'app.kubernetes.io/component': 'controller',
    });
    expect(sm.spec.namespaceSelector.matchNames).toEqual(['cert-manager']);
    expect(sm.spec.endpoints[0]).toMatchObject({ port: 'http-metrics', honorLabels: true });
    expect(sm.spec.endpoints[0].relabelings).toEqual([
      { targetLabel: 'job', replacement: 'cert-manager' },
      { action: 'labeldrop', regex: '(pod|container|endpoint|service)' },
      { targetLabel: 'instance', replacement: 'cert-manager' },
    ]);
    expectLabels(sm, { release: 'kube-prometheus-stack' });
  });

  it('alerts on certificates that are not ready', () => {
    const notReady = rule('CertManagerCertificateNotReady');
    expect(notReady.expr).toBe('max by (namespace, name) (certmanager_certificate_ready_status{condition!="True"}) == 1');
    expect(notReady.for).toBe('30m');
    expect(notReady.labels.severity).toBe('warning');
  });

  it('alerts when a planned renewal is more than a day overdue', () => {
    const renewal = rule('CertManagerCertificateRenewalOverdue');
    expect(renewal.expr).toBe(
      '(time() - max by (namespace, name) (certmanager_certificate_renewal_timestamp_seconds) > 86400)'
      + ' and max by (namespace, name) (certmanager_certificate_renewal_timestamp_seconds) > 0',
    );
    expect(renewal.labels.severity).toBe('warning');
  });

  it('alerts critical when a certificate expires within 7 days', () => {
    const expiring = rule('CertManagerCertificateExpiringSoon');
    expect(expiring.expr).toBe(
      '(max by (namespace, name) (certmanager_certificate_expiration_timestamp_seconds) - time() < 604800)'
      + ' and max by (namespace, name) (certmanager_certificate_expiration_timestamp_seconds) > 0',
    );
    expect(expiring.labels.severity).toBe('critical');
  });

  it('alerts when cert-manager is not scraped', () => {
    expect(rule('CertManagerMetricsAbsent').expr).toBe('absent(up{job="cert-manager"} == 1)');
  });

  it('omits the PrometheusRule when alerts=false', () => {
    expect(findResource(synth(false), 'PrometheusRule', 'cert-manager')).toBeUndefined();
  });
});
