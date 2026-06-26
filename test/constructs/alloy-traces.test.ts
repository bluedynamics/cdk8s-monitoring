import { Testing } from 'cdk8s';
import { AlloyTracesConstruct } from '../../src/constructs/alloy-traces';
import { createTestConfig, synthesizeChart, findResource, expectSyncWave } from '../helpers';

describe('AlloyTracesConstruct', () => {
  it('creates a deployment-mode Alloy with OTLP receiver, tail sampling, and Tempo export', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new AlloyTracesConstruct(chart, 'test-alloy-traces', { namespace: 'monitoring', config });
    const manifests = synthesizeChart(chart);
    const helm = findResource(manifests, 'HelmChart');
    const values = helm.spec.valuesContent;
    expect(helm.spec.chart).toBe('alloy');
    expect(values).toContain('type: deployment');
    expect(values).toContain('otelcol.receiver.otlp');
    expect(values).toContain('0.0.0.0:4317');
    expect(values).toContain('0.0.0.0:4318');
    expect(values).toContain('otelcol.processor.tail_sampling');
    expect(values).toContain('otelcol.exporter.otlp');
    expect(values).toContain(`tempo.${config.namespace}.svc.cluster.local:4317`);
    expect(values).toContain(String(config.tempo.tailSampling.latencyThresholdMs));
    expect(values).toContain(String(config.tempo.tailSampling.probabilisticPercent));
    expectSyncWave(helm, '3');
  });
});
