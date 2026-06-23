import { Testing } from 'cdk8s';
import { ThanosStoreConstruct } from '../../src/constructs/thanos-store';
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

describe('ThanosStoreConstruct', () => {
  it('should create a StatefulSet', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expect(statefulSet).toBeDefined();
    expect(statefulSet.metadata.namespace).toBe('monitoring');
  });

  it('should configure replicas from config', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      replicas: {
        ...createTestConfig().replicas,
        thanosStore: 2,
      },
    });

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expect(statefulSet.spec.replicas).toBe(2);
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
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    expect(container).toBeDefined();
    expect(container.image).toBe('quay.io/thanos/thanos:v0.37.2');
  });

  it('should configure container resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        thanosStore: {
          requests: { cpu: '25m', memory: '256Mi' },
          limits: { cpu: '250m', memory: '1024Mi' },
        },
      },
    });

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    expectContainerResources(
      container,
      { cpu: '25m', memory: '256Mi' },
      { cpu: '250m', memory: '1024Mi' },
    );
  });

  it('should configure store command with S3 config', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    expect(container.args).toContain('store');
    expect(container.args).toContain('--log.level=info');
    expect(container.args).toContain('--data-dir=/var/thanos/store');
    expect(container.args).toContain('--objstore.config-file=/etc/thanos/objstore.yml');
  });

  it('should configure index and chunk cache', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    const indexCacheArg = container.args.find((arg: string) =>
      arg.includes('--index-cache-size'),
    );
    const chunkCacheArg = container.args.find((arg: string) =>
      arg.includes('--chunk-pool-size'),
    );

    expect(indexCacheArg).toBeDefined();
    expect(chunkCacheArg).toBeDefined();
  });

  it('should expose HTTP and gRPC ports', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    const httpPort = container.ports.find((p: any) => p.name === 'http');
    const grpcPort = container.ports.find((p: any) => p.name === 'grpc');

    expect(httpPort).toBeDefined();
    expect(httpPort.containerPort).toBe(10902);
    expect(grpcPort).toBeDefined();
    expect(grpcPort.containerPort).toBe(10901);
  });

  it('should mount S3 credentials secret', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    expectVolumeMount(container, 'objstore-config', '/etc/thanos', true);
    expectVolume(statefulSet.spec.template.spec, 'objstore-config');
  });

  it('should mount data PVC', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const container = findContainer(statefulSet.spec.template.spec, 'thanos-store');

    expectVolumeMount(container, 'data', '/var/thanos/store');
  });

  it('should configure volumeClaimTemplate with correct size', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      storage: {
        ...createTestConfig().storage,
        thanosStore: '10Gi',
      },
    });

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    const volumeClaimTemplates = statefulSet.spec.volumeClaimTemplates;
    expect(volumeClaimTemplates).toHaveLength(1);
    expect(volumeClaimTemplates[0].metadata.name).toBe('data');
    expect(volumeClaimTemplates[0].spec.resources.requests.storage).toBe('10Gi');
    expect(volumeClaimTemplates[0].spec.storageClassName).toBe('longhorn');
  });

  it('should configure security context', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expect(statefulSet.spec.template.spec.securityContext.fsGroup).toBe(10001);
    expect(statefulSet.spec.template.spec.securityContext.runAsUser).toBe(10001);
    expect(statefulSet.spec.template.spec.securityContext.runAsNonRoot).toBe(true);
  });

  it('should create HTTP Service', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const service = findResource(manifests, 'Service', 'thanos-store-http');

    expect(service).toBeDefined();
    expect(service.metadata.namespace).toBe('monitoring');
    expect(service.spec.ports[0].port).toBe(10902);
    expect(service.spec.ports[0].name).toBe('http');
  });

  it('should create gRPC Service (headless)', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const service = findResource(manifests, 'Service', 'thanos-store-grpc');

    expect(service).toBeDefined();
    expect(service.metadata.namespace).toBe('monitoring');
    expect(service.spec.clusterIP).toBe('None'); // Headless
    expect(service.spec.ports[0].port).toBe(10901);
    expect(service.spec.ports[0].name).toBe('grpc');
  });

  it('should have sync-wave 3 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const httpService = findResource(manifests, 'Service', 'thanos-store-http');
    const grpcService = findResource(manifests, 'Service', 'thanos-store-grpc');

    expectSyncWave(statefulSet, '3');
    expectSyncWave(httpService, '3');
    expectSyncWave(grpcService, '3');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expectLabels(statefulSet, {
      'app.kubernetes.io/name': 'thanos-store',
      'app.kubernetes.io/component': 'store-gateway',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should use high-priority class', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expect(statefulSet.spec.template.spec.priorityClassName).toBe('high-priority');
  });

  it('should not pin to a specific arch (Thanos is multi-arch)', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const statefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expect(statefulSet.spec.template.spec.nodeSelector).toBeUndefined();
  });

  it('should create 3 resources total', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosStoreConstruct(chart, 'test-store', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    expect(manifests).toHaveLength(3); // StatefulSet + HTTP Service + gRPC Service
  });
});
