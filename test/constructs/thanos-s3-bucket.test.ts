import { Testing } from 'cdk8s';
import { ThanosS3BucketConstruct } from '../../src/constructs/thanos-s3-bucket';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('ThanosS3BucketConstruct', () => {
  it('should create a Bucket resource', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');

    expect(bucket).toBeDefined();
    expect(bucket.metadata.name).toBe(config.s3.buckets.thanos);
  });

  it('should have correct bucket configuration', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');

    expect(bucket.spec.deletionPolicy).toBe('Delete');
    expect(bucket.spec.forProvider.region).toBe(config.s3.region);
    expect(bucket.spec.providerConfigRef.name).toBe(config.integrations.s3ProviderConfig);
  });

  it('should skip Update management policy', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');

    expect(bucket.spec.managementPolicies).toEqual([
      'Observe',
      'Create',
      'Delete',
    ]);
    expect(bucket.spec.managementPolicies).not.toContain('Update');
  });

  it('should create BucketVersioning resource', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const versioning = findResource(manifests, 'BucketVersioning');

    expect(versioning).toBeDefined();
    expect(versioning.metadata.name).toContain('versioning');
  });

  it('should configure versioning to Enabled', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const versioning = findResource(manifests, 'BucketVersioning');

    expect(versioning.spec.forProvider.versioningConfiguration.status).toBe(
      'Enabled',
    );
  });

  it('should create BucketLifecycleConfiguration', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const lifecycle = findResource(manifests, 'BucketLifecycleConfiguration');

    expect(lifecycle).toBeDefined();
    expect(lifecycle.metadata.name).toContain('lifecycle');
  });

  it('should configure 730-day retention for metrics', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const lifecycle = findResource(manifests, 'BucketLifecycleConfiguration');

    const rules = lifecycle.spec.forProvider.rule;
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('expire-old-blocks'); // Thanos terminology: metric blocks
    expect(rules[0].status).toBe('Enabled');
    expect(rules[0].expiration[0].days).toBe(730); // 2 years
  });

  it('should have sync-wave 1 annotation on all resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');
    const versioning = findResource(manifests, 'BucketVersioning');
    const lifecycle = findResource(manifests, 'BucketLifecycleConfiguration');

    expectSyncWave(bucket, '1');
    expectSyncWave(versioning, '1');
    expectSyncWave(lifecycle, '1');
  });

  it('should have correct labels on all resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');

    expectLabels(bucket, {
      'app.kubernetes.io/name': 'thanos',
      'app.kubernetes.io/component': 'storage',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct Crossplane apiVersion', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    const bucket = findResource(manifests, 'Bucket');
    const versioning = findResource(manifests, 'BucketVersioning');
    const lifecycle = findResource(manifests, 'BucketLifecycleConfiguration');

    // Bucket/Versioning use v1beta2; the lifecycle typed import is still v1beta1
    // (the live BucketLifecycleConfiguration is SYNCED/READY on v1beta1).
    expect(bucket.apiVersion).toBe('s3.aws.upbound.io/v1beta2');
    expect(versioning.apiVersion).toBe('s3.aws.upbound.io/v1beta2');
    expect(lifecycle.apiVersion).toBe('s3.aws.upbound.io/v1beta1');
  });

  it('should create 3 resources total', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3BucketConstruct(chart, 'test-bucket', { config });

    // Assert
    const manifests = synthesizeChart(chart);
    expect(manifests).toHaveLength(3);
  });
});
