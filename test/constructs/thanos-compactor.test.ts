import { Testing } from 'cdk8s';
import { ThanosCompactorConstruct } from '../../src/constructs/thanos-compactor';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
  findContainer,
  expectContainerResources,
  expectVolumeMount,
  expectVolume,
} from '../helpers';

describe('ThanosCompactorConstruct', () => {
  it('should create a StatefulSet', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(statefulSet).toBeDefined();
    expect(statefulSet.metadata.namespace).toBe('monitoring');
  });

  it('should be a singleton (1 replica)', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(statefulSet.spec.replicas).toBe(1);
  });

  it('should use correct Thanos image version', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      versions: {
        ...createTestConfig().versions,
        thanos: 'v0.37.2',
      },
    });

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expect(container).toBeDefined();
    expect(container.image).toBe('quay.io/thanos/thanos:v0.37.2');
  });

  it('should configure container resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        thanosCompactor: {
          requests: { cpu: '25m', memory: '256Mi' },
          limits: { cpu: '250m', memory: '1024Mi' },
        },
      },
    });

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expectContainerResources(
      container,
      { cpu: '25m', memory: '256Mi' },
      { cpu: '250m', memory: '1024Mi' },
    );
  });

  it('should configure compact command with retention policies', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      retention: {
        ...createTestConfig().retention,
        prometheusS3Raw: 30,
        prometheusS35m: 180,
        prometheusS31h: 730,
      },
    });

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expect(container.args).toContain('compact');
    expect(container.args).toContain('--log.level=info');
    expect(container.args).toContain('--data-dir=/var/thanos/compactor');
    expect(container.args).toContain('--objstore.config-file=/etc/thanos/objstore.yml');
    expect(container.args).toContain('--wait');

    // Check retention policies
    expect(container.args).toContain('--retention.resolution-raw=30d');
    expect(container.args).toContain('--retention.resolution-5m=180d');
    expect(container.args).toContain('--retention.resolution-1h=730d');
  });

  it('should configure compaction settings', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expect(container.args).toContain('--compact.concurrency=1');
    expect(container.args).toContain('--delete-delay=48h');
  });

  it('should expose HTTP port', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    const httpPort = container.ports.find((p: any) => p.name === 'http');

    expect(httpPort).toBeDefined();
    expect(httpPort.containerPort).toBe(10902);
  });

  it('should mount S3 credentials secret', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expectVolumeMount(container, 'objstore-config', '/etc/thanos', true);
    expectVolume(statefulSet.spec.template.spec, 'objstore-config');
  });

  it('should mount data PVC', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expectVolumeMount(container, 'data', '/var/thanos/compactor');
  });

  it('should configure volumeClaimTemplate with correct size', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      storage: {
        ...createTestConfig().storage,
        thanosCompactor: '20Gi',
      },
    });

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    const volumeClaimTemplates = statefulSet.spec.volumeClaimTemplates;
    expect(volumeClaimTemplates).toHaveLength(1);
    expect(volumeClaimTemplates[0].metadata.name).toBe('data');
    expect(volumeClaimTemplates[0].spec.resources.requests.storage).toBe('20Gi');
    expect(volumeClaimTemplates[0].spec.storageClassName).toBe('longhorn');
  });

  it('should configure security context', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(statefulSet.spec.template.spec.securityContext.fsGroup).toBe(10001);
    expect(statefulSet.spec.template.spec.securityContext.runAsUser).toBe(10001);
    expect(statefulSet.spec.template.spec.securityContext.runAsNonRoot).toBe(true);
  });

  it('should configure health probes', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-compactor');

    expect(container.livenessProbe).toBeDefined();
    expect(container.livenessProbe.httpGet.path).toBe('/-/healthy');
    expect(container.livenessProbe.httpGet.port).toBe('http');

    expect(container.readinessProbe).toBeDefined();
    expect(container.readinessProbe.httpGet.path).toBe('/-/ready');
    expect(container.readinessProbe.httpGet.port).toBe('http');
  });

  it('should create HTTP Service', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const service = findResource(manifests, 'Service', 'thanos-compactor');

    expect(service).toBeDefined();
    expect(service.metadata.namespace).toBe('monitoring');
    expect(service.spec.ports[0].port).toBe(10902);
    expect(service.spec.ports[0].name).toBe('http');
  });

  it('should have sync-wave 3 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const service = findResource(manifests, 'Service', 'thanos-compactor');

    expectSyncWave(statefulSet, '3');
    expectSyncWave(service, '3');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expectLabels(statefulSet, {
      'app.kubernetes.io/name': 'thanos-compactor',
      'app.kubernetes.io/component': 'compactor',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should use high-priority class', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(statefulSet.spec.template.spec.priorityClassName).toBe('high-priority');
  });

  it('should not pin to a specific arch (Thanos is multi-arch)', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(statefulSet.spec.template.spec.nodeSelector).toBeUndefined();
  });

  it('should create 2 resources total', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosCompactorConstruct(chart, 'test-compactor', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    expect(manifests).toHaveLength(2); // StatefulSet + HTTP Service
  });
});
