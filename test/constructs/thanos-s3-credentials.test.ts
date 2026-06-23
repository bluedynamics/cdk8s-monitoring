import { Testing } from 'cdk8s';
import { ThanosS3CredentialsConstruct } from '../../src/constructs/thanos-s3-credentials';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('ThanosS3CredentialsConstruct', () => {
  it('should create an ExternalSecret', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret).toBeDefined();
    expect(externalSecret.metadata.name).toBe('thanos-s3-credentials-es');
    expect(externalSecret.metadata.namespace).toBe('monitoring');
  });

  it('should have correct SecretStoreRef', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret.spec.secretStoreRef.kind).toBe('ClusterSecretStore');
    expect(externalSecret.spec.secretStoreRef.name).toBe('hetzner-s3-cluster-store');
  });

  it('should reference crossplane-system namespace secret', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    const dataFrom = externalSecret.spec.dataFrom;
    expect(dataFrom).toHaveLength(1);
    expect(dataFrom[0].extract.key).toBe('hetzner-s3-creds-standard');
  });

  it('should use template engine v2', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret.spec.target.template.engineVersion).toBe('v2');
  });

  it('should template objstore.yml with correct format', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      s3: {
        endpoint: 'https://s3.example.com',
        endpointNoProtocol: 's3.example.com',
        region: 'eu-central-1',
        buckets: {
          thanos: 'metrics-thanos-test',
          loki: 'logs-loki-test',
        },
      },
    });

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    const objstoreYml = externalSecret.spec.target.template.data['objstore.yml'];

    // Verify it's a valid YAML template string
    expect(objstoreYml).toContain('type: S3');
    expect(objstoreYml).toContain('bucket: "metrics-thanos-test"');
    expect(objstoreYml).toContain('endpoint: "s3.example.com"');
    expect(objstoreYml).toContain('region: eu-central-1');
    expect(objstoreYml).toContain('access_key: {{ .AWS_ACCESS_KEY_ID }}');
    expect(objstoreYml).toContain('secret_key: {{ .AWS_SECRET_ACCESS_KEY }}');
    expect(objstoreYml).toContain('insecure: false');
  });

  it('should create target secret with correct name', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret.spec.target.name).toBe('thanos-objstore-config');
  });

  it('should have sync-wave 1 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expectSyncWave(externalSecret, '1');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expectLabels(externalSecret, {
      'app.kubernetes.io/name': 'thanos',
      'app.kubernetes.io/component': 'objstore-config',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    // Using v1 (stable GA version) instead of v1beta1
    expect(externalSecret.apiVersion).toBe('external-secrets.io/v1');
    expect(externalSecret.kind).toBe('ExternalSecret');
  });

  it('should configure refresh interval', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret.spec.refreshInterval).toBe('1h');
  });
});
