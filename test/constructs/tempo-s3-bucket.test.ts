import { Testing } from 'cdk8s';
import { TempoS3BucketConstruct } from '../../src/constructs/tempo-s3-bucket';
import { createTestConfig, synthesizeChart, findResource, expectSyncWave } from '../helpers';

describe('TempoS3BucketConstruct', () => {
  it('creates a Bucket named by config.tempo.bucket using the configured provider', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new TempoS3BucketConstruct(chart, 'test-bucket', { config });
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');
    expect(bucket.metadata.name).toBe(config.tempo.bucket);
    expect(bucket.spec.forProvider.region).toBe(config.s3.region);
    expect(bucket.spec.providerConfigRef.name).toBe(config.integrations.s3ProviderConfig);
    expectSyncWave(bucket, '1');
  });
});
