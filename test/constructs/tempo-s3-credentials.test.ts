import { Testing } from 'cdk8s';
import { TempoS3CredentialsConstruct } from '../../src/constructs/tempo-s3-credentials';
import { createTestConfig, synthesizeChart, findResource, expectSyncWave } from '../helpers';

describe('TempoS3CredentialsConstruct', () => {
  it('creates an ExternalSecret using the configured store and key', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    const c = new TempoS3CredentialsConstruct(chart, 'test-creds', { namespace: 'monitoring', config });
    const manifests = synthesizeChart(chart);
    const es = findResource(manifests, 'ExternalSecret');
    expect(c.secretName).toBe('tempo-s3-credentials');
    expect(es.spec.secretStoreRef.name).toBe(config.integrations.s3SecretStore);
    expect(es.spec.dataFrom[0].extract.key).toBe(config.integrations.s3CredentialsKey);
    expectSyncWave(es, '1');
  });
});
