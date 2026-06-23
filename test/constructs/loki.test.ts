import { Testing } from 'cdk8s';
import { LokiConstruct } from '../../src/constructs/loki';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('LokiConstruct', () => {
  it('should create a HelmChart resource', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart).toBeDefined();
    expect(helmChart.metadata.name).toBe('loki');
    expect(helmChart.metadata.namespace).toBe('monitoring');
  });

  it('should use correct Helm repository and chart', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.repo).toBe('https://grafana.github.io/helm-charts');
    expect(helmChart.spec.chart).toBe('loki');
    expect(helmChart.spec.version).toBe(config.versions.loki);
  });

  it('should deploy to monitoring namespace', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.targetNamespace).toBe('monitoring');
  });

  it('should use SimpleScalable deployment mode', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('deploymentMode: SimpleScalable');
  });

  it('should configure S3 storage', () => {
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
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('chunks: logs-loki-test');
    expect(values).toContain('endpoint: https://s3.example.com');
    expect(values).toContain('region: auto');
  });

  it('should configure retention period', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      retention: {
        ...createTestConfig().retention,
        loki: '744h',
      },
    });

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('retention_period: 744h');
  });

  it('should configure backend component resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        lokiBackend: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
      replicas: {
        ...createTestConfig().replicas,
        lokiBackend: 1,
      },
      storage: {
        ...createTestConfig().storage,
        lokiBackend: '10Gi',
      },
    });

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('replicas: 1');
    expect(values).toContain('cpu: 100m');
    expect(values).toContain('memory: 256Mi');
    expect(values).toContain('cpu: 500m');
    expect(values).toContain('memory: 512Mi');
    expect(values).toContain('size: 10Gi');
  });

  it('should configure read and write components', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      replicas: {
        ...createTestConfig().replicas,
        lokiRead: 2,
        lokiWrite: 2,
      },
    });

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // Check that read and write replicas are configured
    const replicaMatches = values.match(/replicas: 2/g);
    expect(replicaMatches).not.toBeNull();
    expect(replicaMatches!.length).toBeGreaterThanOrEqual(2); // At least read and write
  });

  it('should configure gateway resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        lokiGateway: {
          requests: { cpu: '50m', memory: '128Mi' },
          limits: { cpu: '200m', memory: '256Mi' },
        },
      },
    });

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('cpu: 50m');
    expect(values).toContain('memory: 128Mi');
    expect(values).toContain('cpu: 200m');
    expect(values).toContain('memory: 256Mi');
  });

  it('should have sync-wave 2 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectSyncWave(helmChart, '2');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectLabels(helmChart, {
      'app.kubernetes.io/name': 'loki',
      'app.kubernetes.io/component': 'logging',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.apiVersion).toBe('helm.cattle.io/v1');
    expect(helmChart.kind).toBe('HelmChart');
  });

  it('should use longhorn storage class', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('storageClass: longhorn');
  });

  it('should configure high-priority class', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('priorityClassName: high-priority');
  });

  it('should configure S3 credentials via environment variables', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new LokiConstruct(chart, 'test-loki', {
      namespace: 'monitoring',
      config,
      s3CredentialsSecretName: 'loki-s3-credentials',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // Check that credentials use environment variable expansion
    expect(values).toContain('secretAccessKey: ${AWS_SECRET_ACCESS_KEY}');
    expect(values).toContain('accessKeyId: ${AWS_ACCESS_KEY_ID}');
    // Check that config expansion is enabled
    expect(values).toContain('-config.expand-env=true');
    // Check that secret is referenced via extraEnvFrom
    expect(values).toContain('name: loki-s3-credentials');
  });
});
