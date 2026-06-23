import { Testing } from 'cdk8s';
import { PrometheusStackConstruct } from '../../src/constructs/prometheus-stack';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('PrometheusStackConstruct', () => {
  it('should create a HelmChart resource', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart).toBeDefined();
    expect(helmChart.metadata.name).toBe('kube-prometheus-stack');
    expect(helmChart.metadata.namespace).toBe('monitoring');
  });

  it('should use correct Helm repository and chart', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.repo).toBe(
      'https://prometheus-community.github.io/helm-charts',
    );
    expect(helmChart.spec.chart).toBe('kube-prometheus-stack');
    expect(helmChart.spec.version).toBe(config.versions.prometheusStack);
  });

  it('should deploy to monitoring namespace', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.targetNamespace).toBe('monitoring');
  });

  it('should configure Prometheus resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        prometheus: {
          requests: { cpu: '100m', memory: '1500Mi' },
          limits: { cpu: '2000m', memory: '3000Mi' },
        },
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('cpu: 100m');
    expect(values).toContain('memory: 1500Mi');
    expect(values).toContain('cpu: 2000m');
    expect(values).toContain('memory: 3000Mi');
  });

  it('should configure Prometheus replicas and retention', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      replicas: {
        ...createTestConfig().replicas,
        prometheus: 2,
      },
      retention: {
        ...createTestConfig().retention,
        prometheus: '3d',
      },
      storage: {
        ...createTestConfig().storage,
        prometheus: '3Gi',
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('replicas: 2');
    expect(values).toContain('retention: 3d');
    expect(values).toContain('storage: 3Gi');
  });

  it('should configure Thanos sidecar', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      versions: {
        ...createTestConfig().versions,
        thanos: 'v0.37.2',
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // The sidecar image is injected by the Prometheus Operator, not set in
    // helm values. What matters is that the objectStorageConfig uses the
    // existingSecret shape required by chart >=85.x (the flat {name, key}
    // form is silently dropped, removing the sidecar).
    expect(values).toContain('thanosService:');
    expect(values).toContain('objectStorageConfig:');
    expect(values).toContain('existingSecret:');
    expect(values).toContain('name: thanos-objstore-config');
    expect(values).toContain('key: objstore.yml');
  });

  it('should configure Grafana with correct domain', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      domains: {
        grafana: 'grafana.example.com',
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('- grafana.example.com');
  });

  it('should configure Grafana datasources for Thanos and Loki', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // Thanos Query datasource
    expect(values).toContain('name: Prometheus');
    expect(values).toContain('type: prometheus');
    expect(values).toContain('url: http://thanos-query.monitoring.svc.cluster.local:9090');

    // Loki datasource
    expect(values).toContain('name: Loki');
    expect(values).toContain('type: loki');
    expect(values).toContain('url: http://loki-gateway.monitoring.svc.cluster.local');
  });

  it('should configure Alertmanager with SMTP', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        from: 'alerts@example.com',
        username: 'test-user',
        password: 'test-pass',
        requireTls: true,
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('smarthost: smtp.example.com:587');
    expect(values).toContain('from: alerts@example.com');
    expect(values).toContain('auth_username: test-user');
    expect(values).toContain('auth_password: test-pass');
    expect(values).toContain('require_tls: true');
  });

  it('should have sync-wave 2 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
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
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectLabels(helmChart, {
      'app.kubernetes.io/name': 'kube-prometheus-stack',
      'app.kubernetes.io/component': 'monitoring',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.apiVersion).toBe('helm.cattle.io/v1');
    expect(helmChart.kind).toBe('HelmChart');
  });

  it('should configure storage class as longhorn', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('storageClassName: longhorn');
  });

  it('should configure priority class as high-priority', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('priorityClassName: high-priority');
  });
});
