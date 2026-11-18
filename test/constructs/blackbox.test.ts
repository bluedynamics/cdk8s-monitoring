import { Testing } from 'cdk8s';
import { parse } from 'yaml';
import { BlackboxConstruct } from '../../src/constructs/blackbox';
import { createTestConfig, synthesizeChart, findResource, expectLabels } from '../helpers';

describe('BlackboxConstruct', () => {
  const synth = (blackbox: object = {}) => {
    const chart = Testing.chart();
    const base = createTestConfig();
    const config = createTestConfig({
      blackbox: { ...base.blackbox, enabled: true, httpTargets: ['https://example.com/'], ...blackbox },
    });
    new BlackboxConstruct(chart, 'test-blackbox', { namespace: 'monitoring', config });
    return synthesizeChart(chart);
  };
  const rule = (name: string) =>
    findResource(synth(), 'PrometheusRule', 'blackbox').spec.groups[0].rules.find((r: any) => r.alert === name);

  it('deploys the exporter with an http and a tls module under a fixed name', () => {
    const helmChart = synth().find((m: any) => m.kind === 'HelmChart' && m.metadata.name === 'blackbox-exporter');
    expect(helmChart.spec.chart).toBe('prometheus-blackbox-exporter');
    expect(helmChart.spec.repo).toBe('https://prometheus-community.github.io/helm-charts');
    expect(helmChart.spec.failurePolicy).toBe('abort');
    const values = parse(helmChart.spec.valuesContent);
    expect(values.fullnameOverride).toBe('blackbox-exporter');
    expect(values.config.modules.http_2xx).toEqual({
      prober: 'http', timeout: '10s', http: { preferred_ip_protocol: 'ip4', follow_redirects: true },
    });
    expect(values.config.modules.tls_connect).toEqual({
      prober: 'tcp', timeout: '10s', tcp: { preferred_ip_protocol: 'ip4', tls: true },
    });
  });

  it('probes the http targets through the exporter', () => {
    const probe = findResource(synth(), 'Probe', 'blackbox-http');
    expect(probe.metadata.namespace).toBe('monitoring');
    expect(probe.spec.prober.url).toBe('blackbox-exporter.monitoring.svc:9115');
    expect(probe.spec.module).toBe('http_2xx');
    expect(probe.spec.targets.staticConfig.static).toEqual(['https://example.com/']);
    expectLabels(probe, { release: 'kube-prometheus-stack' });
  });

  it('creates the tls probe only for tls targets', () => {
    expect(findResource(synth(), 'Probe', 'blackbox-tls')).toBeUndefined();
    const probe = findResource(synth({ tlsTargets: ['mail.example.com:993'] }), 'Probe', 'blackbox-tls');
    expect(probe.spec.module).toBe('tls_connect');
    expect(probe.spec.targets.staticConfig.static).toEqual(['mail.example.com:993']);
  });

  it('warns after 5 minutes and pages after 15 minutes of failed probes', () => {
    expect(rule('BlackboxProbeFailed')).toMatchObject({ expr: 'probe_success == 0', for: '5m', labels: { severity: 'warning' } });
    expect(rule('BlackboxProbeDown')).toMatchObject({ expr: 'probe_success == 0', for: '15m', labels: { severity: 'critical' } });
  });

  it('warns on certificates expiring within certWarningDays and pages within 7 days', () => {
    expect(rule('BlackboxCertificateExpiringSoon')).toMatchObject({
      expr: 'probe_ssl_earliest_cert_expiry - time() < 1209600', labels: { severity: 'warning' },
    });
    expect(rule('BlackboxCertificateExpiring')).toMatchObject({
      expr: 'probe_ssl_earliest_cert_expiry - time() < 604800', labels: { severity: 'critical' },
    });
  });

  it('warns when no probe results arrive', () => {
    expect(rule('BlackboxProbesAbsent').expr).toBe('absent(probe_success)');
  });

  it('omits the PrometheusRule when alerts=false', () => {
    expect(findResource(synth({ alerts: false }), 'PrometheusRule', 'blackbox')).toBeUndefined();
  });
});
