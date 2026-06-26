import { Testing } from 'cdk8s';
import { TempoConstruct } from '../../src/constructs/tempo';
import { createTestConfig, synthesizeChart, findResource, expectSyncWave } from '../helpers';

describe('TempoConstruct', () => {
  it('creates a grafana/tempo HelmChart backed by S3 with the configured bucket and retention', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new TempoConstruct(chart, 'test-tempo', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'tempo-s3-credentials',
    });
    const manifests = synthesizeChart(chart);
    const helm = findResource(manifests, 'HelmChart');
    expect(helm.spec.chart).toBe('tempo');
    expect(helm.spec.repo).toContain('grafana.github.io');
    expect(helm.spec.valuesContent).toContain(config.tempo.bucket);
    expect(helm.spec.valuesContent).toContain(config.s3.endpointNoProtocol);
    expect(helm.spec.valuesContent).toContain(config.tempo.retention);
    expectSyncWave(helm, '3');
  });
});
