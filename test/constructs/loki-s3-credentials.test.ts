import { Testing } from 'cdk8s';
import { LokiS3CredentialsConstruct } from '../../src/constructs/loki-s3-credentials';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('LokiS3CredentialsConstruct', () => {
  it('should create an ExternalSecret', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret).toBeDefined();
    expect(externalSecret.metadata.name).toBe('loki-s3-credentials-es');
    expect(externalSecret.metadata.namespace).toBe('monitoring');
  });

  it('should expose secretName property', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    const construct = new LokiS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    expect(construct.secretName).toBe('loki-s3-credentials');
  });

  it('should have correct SecretStoreRef', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
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
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
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

  it('should create target secret with correct name', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret.spec.target.name).toBe('loki-s3-credentials');
  });

  it('should have sync-wave 1 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
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
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expectLabels(externalSecret, {
      'app.kubernetes.io/name': 'loki',
      'app.kubernetes.io/component': 's3-credentials',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    expect(externalSecret.apiVersion).toBe('external-secrets.io/v1');
    expect(externalSecret.kind).toBe('ExternalSecret');
  });

  it('should configure refresh interval', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiS3CredentialsConstruct(chart, 'test-secret', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const externalSecret = findResource(manifests, 'ExternalSecret');

    // Deliberately the normalized full form ('1h0m0s') to avoid ArgoCD drift.
    expect(externalSecret.spec.refreshInterval).toBe('1h0m0s');
  });
});
