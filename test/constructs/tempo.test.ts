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

  it('softens the liveness probe so query load does not trigger SIGKILL', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new TempoConstruct(chart, 'test-tempo', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'tempo-s3-credentials',
    });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain('livenessProbe:');
    expect(values).toContain('timeoutSeconds: 15');
    expect(values).toContain('failureThreshold: 6');
  });

  it('injects S3 credentials via env from the secret, not inline in the config', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new TempoConstruct(chart, 'test-tempo', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'tempo-s3-credentials',
    });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    // env-based credentials (SDK default chain), not static keys in the rendered config
    expect(values).toContain('name: tempo-s3-credentials');
    expect(values).toContain('AWS_ACCESS_KEY_ID');
    expect(values).not.toContain('access_key:');
    expect(values).not.toContain('secret_key:');
  });
});
