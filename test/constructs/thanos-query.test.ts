import { Testing } from 'cdk8s';
import { ThanosQueryConstruct } from '../../src/constructs/thanos-query';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
  findContainer,
  expectContainerResources,
} from '../helpers';

describe('ThanosQueryConstruct', () => {
  it('should create a Deployment', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');

    expect(deployment).toBeDefined();
    expect(deployment.metadata.namespace).toBe('monitoring');
  });

  it('should configure replicas from config', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      replicas: {
        ...createTestConfig().replicas,
        thanosQuery: 2,
      },
    });

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');

    expect(deployment.spec.replicas).toBe(2);
  });

  it('should configure anti-affinity for HA', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');

    const affinity = deployment.spec.template.spec.affinity;
    expect(affinity).toBeDefined();
    expect(affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution).toBeDefined();
    expect(affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[0].weight).toBe(100);
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
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');
    const container = findContainer(deployment.spec.template.spec, 'thanos-query');

    expect(container).toBeDefined();
    expect(container.image).toBe('quay.io/thanos/thanos:v0.37.2');
  });

  it('should configure container resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        thanosQuery: {
          requests: { cpu: '25m', memory: '128Mi' },
          limits: { cpu: '250m', memory: '512Mi' },
        },
      },
    });

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');
    const container = findContainer(deployment.spec.template.spec, 'thanos-query');

    expectContainerResources(
      container,
      { cpu: '25m', memory: '128Mi' },
      { cpu: '250m', memory: '512Mi' },
    );
  });

  it('should configure query command with store endpoints', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');
    const container = findContainer(deployment.spec.template.spec, 'thanos-query');

    expect(container.args).toContain('query');
    expect(container.args).toContain('--log.level=info');
    expect(container.args).toContain('--query.replica-label=replica');

    // Check store endpoints (SRV-based discovery via dnssrv+_grpc._tcp)
    // Prometheus sidecar gRPC is exposed by the operator's thanos discovery
    // service, NOT prometheus-operated (which only has http-web:9090).
    const prometheusEndpoints = container.args.filter((arg: string) =>
      arg.includes('kube-prometheus-stack-thanos-discovery.monitoring.svc.cluster.local'),
    );
    expect(prometheusEndpoints.length).toBeGreaterThan(0);

    const thanosStoreEndpoints = container.args.filter((arg: string) =>
      arg.includes('thanos-store-grpc.monitoring.svc.cluster.local'),
    );
    expect(thanosStoreEndpoints.length).toBeGreaterThan(0);
  });

  it('should expose HTTP and gRPC ports', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');
    const container = findContainer(deployment.spec.template.spec, 'thanos-query');

    const httpPort = container.ports.find((p: any) => p.name === 'http');
    const grpcPort = container.ports.find((p: any) => p.name === 'grpc');

    expect(httpPort).toBeDefined();
    // Thanos listens HTTP on 10902 (the Service maps its 9090 port to this).
    expect(httpPort.containerPort).toBe(10902);
    expect(grpcPort).toBeDefined();
    expect(grpcPort.containerPort).toBe(10901);
  });

  it('should create HTTP Service', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const service = findResource(manifests, 'Service', 'thanos-query');

    expect(service).toBeDefined();
    expect(service.metadata.namespace).toBe('monitoring');
    expect(service.spec.ports[0].port).toBe(9090);
    expect(service.spec.ports[0].name).toBe('http');
  });

  it('should create gRPC Service (headless)', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const service = findResource(manifests, 'Service', 'thanos-query-grpc');

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
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');
    const httpService = findResource(manifests, 'Service', 'thanos-query');
    const grpcService = findResource(manifests, 'Service', 'thanos-query-grpc');

    expectSyncWave(deployment, '3');
    expectSyncWave(httpService, '3');
    expectSyncWave(grpcService, '3');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');

    expectLabels(deployment, {
      'app.kubernetes.io/name': 'thanos-query',
      'app.kubernetes.io/component': 'query',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should use high-priority class', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');

    expect(deployment.spec.template.spec.priorityClassName).toBe('high-priority');
  });

  it('should not pin to a specific arch (Thanos is multi-arch)', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const deployment = findResource(manifests, 'Deployment', 'thanos-query');

    expect(deployment.spec.template.spec.nodeSelector).toBeUndefined();
  });

  it('should create 3 resources total', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new ThanosQueryConstruct(chart, 'test-query', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    expect(manifests).toHaveLength(3); // Deployment + HTTP Service + gRPC Service
  });
});
