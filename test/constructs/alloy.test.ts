import { Testing } from 'cdk8s';
import { AlloyConstruct } from '../../src/constructs/alloy';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('AlloyConstruct', () => {
  it('should create a HelmChart resource', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart).toBeDefined();
    expect(helmChart.metadata.name).toBe('alloy');
    expect(helmChart.metadata.namespace).toBe('monitoring');
  });

  it('should use correct Helm repository and chart', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.repo).toBe('https://grafana.github.io/helm-charts');
    expect(helmChart.spec.chart).toBe('alloy');
    expect(helmChart.spec.version).toBe(config.versions.alloy);
  });

  it('should deploy to monitoring namespace', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.targetNamespace).toBe('monitoring');
  });

  it('should use DaemonSet mode', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('type: daemonset');
  });

  it('tags logs with config.clusterName, not a hardcoded cluster', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new AlloyConstruct(chart, 'test-alloy', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain(`cluster = "${config.clusterName}"`);
    expect(values).not.toContain('cluster = "kup6s"');
  });

  it('should configure Alloy resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        alloy: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
    });

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('cpu: 100m');
    expect(values).toContain('memory: 256Mi');
    expect(values).toContain('cpu: 500m');
    expect(values).toContain('memory: 512Mi');
  });

  it('should configure Loki write endpoint', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain(
      'url = "http://loki-gateway.monitoring.svc.cluster.local/loki/api/v1/push"',
    );
  });

  it('should configure log collection for all pods', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // Collects logs from all pods (no namespace filter)
    expect(values).toContain('loki.source.kubernetes "pods"');
    expect(values).toContain('discovery.relabel "pod_logs"');
    expect(values).toContain(`cluster = "${config.clusterName}"`);
  });

  it('should configure JSON log processing', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('stage.json');
    expect(values).toContain('stage.output');
    expect(values).toContain('source = "event"');
  });

  it('should configure structured metadata extraction', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('stage.structured_metadata');
    expect(values).toContain('values = {');
  });

  it('should configure log labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('stage.labels');
    expect(values).toContain('level = "level"');
  });

  it('should have sync-wave 3 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectSyncWave(helmChart, '3');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectLabels(helmChart, {
      'app.kubernetes.io/name': 'alloy',
      'app.kubernetes.io/component': 'log-collector',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new AlloyConstruct(chart, 'test-alloy', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.apiVersion).toBe('helm.cattle.io/v1');
    expect(helmChart.kind).toBe('HelmChart');
  });

  // NOTE: Privileged mode and host path mounts are NOT needed with the
  // Kubernetes API approach (loki.source.kubernetes). The implementation
  // uses the Kubernetes API to discover and read pod logs, which is more
  // secure than filesystem access and doesn't require privileged containers.
});
