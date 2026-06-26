import { App } from 'cdk8s';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  findResourcesByKind,
  expectSyncWave,
} from './helpers';
import { MonitoringChart } from '../src/monitoring-chart';

describe('MonitoringChart Integration Tests', () => {
  it('should create all expected resources', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);

    // Expect 20 resources total:
    // Wave 0: Namespace, PriorityClass (2)
    // Wave 1: 2 S3 Buckets (Thanos, Loki) with Versioning + Lifecycle = 6, ExternalSecret (1) = 7
    // Wave 2: 2 HelmCharts (Prometheus, Loki) = 2
    // Wave 3: 3 HelmChart (Alloy) + Thanos (Query: 3, Store: 3, Compactor: 2) = 9
    // Total = 2 + 7 + 2 + 9 = 20
    expect(manifests.length).toBeGreaterThanOrEqual(20);
  });

  it('should create namespace in wave 0', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig({ namespace: 'monitoring' });

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'monitoring');

    expect(namespace).toBeDefined();
    expectSyncWave(namespace, '0');
  });

  it('should create priority class in wave 0', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expect(priorityClass).toBeDefined();
    expectSyncWave(priorityClass, '0');
  });

  it('should create S3 buckets in wave 1', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const buckets = findResourcesByKind(manifests, 'Bucket');

    expect(buckets).toHaveLength(2); // Thanos and Loki
    buckets.forEach((bucket) => {
      expectSyncWave(bucket, '1');
    });
  });

  it('should create ExternalSecret in wave 1', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    // The ExternalSecret resource is named '-es'; 'thanos-objstore-config' is
    // its target Secret name.
    const externalSecret = findResource(manifests, 'ExternalSecret', 'thanos-s3-credentials-es');

    expect(externalSecret).toBeDefined();
    expectSyncWave(externalSecret, '1');
  });

  it('should create Prometheus and Loki HelmCharts in wave 2', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const prometheusChart = findResource(manifests, 'HelmChart', 'kube-prometheus-stack');
    const lokiChart = findResource(manifests, 'HelmChart', 'loki');

    expect(prometheusChart).toBeDefined();
    expect(lokiChart).toBeDefined();
    expectSyncWave(prometheusChart, '2');
    expectSyncWave(lokiChart, '2');
  });

  it('should create Alloy HelmChart in wave 3', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const alloyChart = findResource(manifests, 'HelmChart', 'alloy');

    expect(alloyChart).toBeDefined();
    expectSyncWave(alloyChart, '3');
  });

  it('should create Thanos Query components in wave 3', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const queryDeployment = findResource(manifests, 'Deployment', 'thanos-query');
    const queryService = findResource(manifests, 'Service', 'thanos-query');
    const queryGrpcService = findResource(manifests, 'Service', 'thanos-query-grpc');

    expect(queryDeployment).toBeDefined();
    expect(queryService).toBeDefined();
    expect(queryGrpcService).toBeDefined();
    expectSyncWave(queryDeployment, '3');
    expectSyncWave(queryService, '3');
    expectSyncWave(queryGrpcService, '3');
  });

  it('should create Thanos Store components in wave 3', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const storeStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const storeService = findResource(manifests, 'Service', 'thanos-store-http');
    const storeGrpcService = findResource(manifests, 'Service', 'thanos-store-grpc');

    expect(storeStatefulSet).toBeDefined();
    expect(storeService).toBeDefined();
    expect(storeGrpcService).toBeDefined();
    expectSyncWave(storeStatefulSet, '3');
    expectSyncWave(storeService, '3');
    expectSyncWave(storeGrpcService, '3');
  });

  it('should create Thanos Compactor components in wave 3', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const compactorStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');
    const compactorService = findResource(manifests, 'Service', 'thanos-compactor');

    expect(compactorStatefulSet).toBeDefined();
    expect(compactorService).toBeDefined();
    expectSyncWave(compactorStatefulSet, '3');
    expectSyncWave(compactorService, '3');
  });

  it('should respect configuration for namespace', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig({
      namespace: 'custom-monitoring',
    });

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'custom-monitoring');
    const externalSecret = findResource(manifests, 'ExternalSecret');
    const queryDeployment = findResource(manifests, 'Deployment', 'thanos-query');

    expect(namespace).toBeDefined();
    expect(externalSecret.metadata.namespace).toBe('custom-monitoring');
    expect(queryDeployment.metadata.namespace).toBe('custom-monitoring');
  });

  it('should respect configuration for integration names', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig({
      integrations: {
        s3ProviderConfig: 'my-provider',
        s3SecretStore: 'my-s3-store',
        s3CredentialsKey: 'my-s3-key',
        grafanaSecretStore: 'my-grafana-store',
        grafanaCredentialsKey: 'my-grafana-key',
      },
    });

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const buckets = findResourcesByKind(manifests, 'Bucket');
    const grafanaSecret = findResource(manifests, 'ExternalSecret', 'grafana-admin-credentials-es');

    buckets.forEach((bucket) => {
      expect(bucket.spec.providerConfigRef.name).toBe('my-provider');
    });
    expect(grafanaSecret.spec.secretStoreRef.name).toBe('my-grafana-store');
    expect(grafanaSecret.spec.dataFrom[0].extract.key).toBe('my-grafana-key');
  });

  it('should respect configuration for versions', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig({
      versions: {
        prometheusStack: 'v70.0.0',
        loki: '7.0.0',
        alloy: 'v2.0.0',
        thanos: 'v0.38.0',
        tempo: 'latest',
      },
    });

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const prometheusChart = findResource(manifests, 'HelmChart', 'kube-prometheus-stack');
    const lokiChart = findResource(manifests, 'HelmChart', 'loki');
    const alloyChart = findResource(manifests, 'HelmChart', 'alloy');
    const queryDeployment = findResource(manifests, 'Deployment', 'thanos-query');

    expect(prometheusChart.spec.version).toBe('v70.0.0');
    expect(lokiChart.spec.version).toBe('7.0.0');
    expect(alloyChart.spec.version).toBe('v2.0.0');

    const container = queryDeployment.spec.template.spec.containers.find(
      (c: any) => c.name === 'thanos-query',
    );
    expect(container.image).toBe('quay.io/thanos/thanos:v0.38.0');
  });

  it('should respect configuration for S3 buckets', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig({
      s3: {
        endpoint: 'https://custom-s3.example.com',
        endpointNoProtocol: 'custom-s3.example.com',
        region: 'us-west-2',
        buckets: {
          thanos: 'custom-thanos-bucket',
          loki: 'custom-loki-bucket',
        },
      },
    });

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const buckets = findResourcesByKind(manifests, 'Bucket');

    const thanosBucket = buckets.find((b) => b.metadata.name === 'custom-thanos-bucket');
    const lokiBucket = buckets.find((b) => b.metadata.name === 'custom-loki-bucket');

    expect(thanosBucket).toBeDefined();
    expect(lokiBucket).toBeDefined();
    expect(thanosBucket.spec.forProvider.region).toBe('us-west-2');
    expect(lokiBucket.spec.forProvider.region).toBe('us-west-2');
  });

  it('should respect configuration for replicas', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig({
      replicas: {
        ...createTestConfig().replicas,
        thanosQuery: 3,
        thanosStore: 3,
      },
    });

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);
    const queryDeployment = findResource(manifests, 'Deployment', 'thanos-query');
    const storeStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');

    expect(queryDeployment.spec.replicas).toBe(3);
    expect(storeStatefulSet.spec.replicas).toBe(3);
  });

  it('should have all resources properly labeled', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);

    // Every labeled resource must declare a recognized manager. Most are
    // 'cdk8s'; the grafana-admin-credentials ExternalSecret is deliberately
    // labeled 'external-secrets' to signal ESO ownership of the target Secret.
    manifests.forEach((resource) => {
      const managedBy = resource.metadata?.labels?.['app.kubernetes.io/managed-by'];
      if (managedBy) {
        expect(['cdk8s', 'external-secrets']).toContain(managedBy);
      }
    });
  });

  it('should create resources in correct sync-wave order', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);

    // Group by sync-wave
    const wave0 = manifests.filter(
      (m) => m.metadata?.annotations?.['argocd.argoproj.io/sync-wave'] === '0',
    );
    const wave1 = manifests.filter(
      (m) => m.metadata?.annotations?.['argocd.argoproj.io/sync-wave'] === '1',
    );
    const wave2 = manifests.filter(
      (m) => m.metadata?.annotations?.['argocd.argoproj.io/sync-wave'] === '2',
    );
    const wave3 = manifests.filter(
      (m) => m.metadata?.annotations?.['argocd.argoproj.io/sync-wave'] === '3',
    );

    // Wave 0: Foundation (namespace, priority-class)
    expect(wave0.length).toBe(2);

    // Wave 1: S3 buckets (2 buckets * 3 resources each = 6) +
    // ExternalSecrets (thanos, loki, grafana = 3) = 9
    expect(wave1.length).toBe(9);

    // Wave 2: Core services (Prometheus, Loki HelmCharts)
    expect(wave2.length).toBe(2);

    // Wave 3: Advanced services (Alloy HelmChart + Thanos components)
    // Alloy (1) + Query (3) + Store (3) + Compactor (2) = 9
    // App dashboards are added by integration charts, not by this library.
    expect(wave3.length).toBe(9);
  });

  it('should use correct storage classes for all PVCs', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);

    // Check StatefulSets with volumeClaimTemplates
    const storeStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const compactorStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(storeStatefulSet.spec.volumeClaimTemplates[0].spec.storageClassName).toBe('longhorn');
    expect(compactorStatefulSet.spec.volumeClaimTemplates[0].spec.storageClassName).toBe('longhorn');
  });

  it('should use high-priority class for all critical components', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);

    // Check Thanos components
    const queryDeployment = findResource(manifests, 'Deployment', 'thanos-query');
    const storeStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const compactorStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(queryDeployment.spec.template.spec.priorityClassName).toBe('high-priority');
    expect(storeStatefulSet.spec.template.spec.priorityClassName).toBe('high-priority');
    expect(compactorStatefulSet.spec.template.spec.priorityClassName).toBe('high-priority');
  });

  it('should not pin Thanos components to a specific arch (multi-arch)', () => {
    // Arrange
    const app = new App();
    const config = createTestConfig();

    // Act
    const chart = new MonitoringChart(app, 'test-monitoring', config);

    // Assert
    const manifests = synthesizeChart(chart);

    // Check Thanos components
    const queryDeployment = findResource(manifests, 'Deployment', 'thanos-query');
    const storeStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-store');
    const compactorStatefulSet = findResource(manifests, 'StatefulSet', 'thanos-compactor');

    expect(queryDeployment.spec.template.spec.nodeSelector).toBeUndefined();
    expect(storeStatefulSet.spec.template.spec.nodeSelector).toBeUndefined();
    expect(compactorStatefulSet.spec.template.spec.nodeSelector).toBeUndefined();
  });

  it('creates Tempo resources only when tempo is enabled', () => {
    const enabled = createTestConfig({ tempo: { ...createTestConfig().tempo, enabled: true, bucket: 'traces-b' } });
    const onManifests = synthesizeChart(new MonitoringChart(new App(), 'm', enabled));
    expect(findResource(onManifests, 'Bucket', 'traces-b')).toBeDefined();
    expect(onManifests.filter((m: any) => m.kind === 'HelmChart' && m.metadata?.name === 'tempo')).toHaveLength(1);
    expect(onManifests.filter((m: any) => m.kind === 'HelmChart' && m.metadata?.name === 'alloy-traces')).toHaveLength(1);

    const disabled = createTestConfig({ tempo: { ...createTestConfig().tempo, enabled: false, bucket: '' } });
    const offManifests = synthesizeChart(new MonitoringChart(new App(), 'm2', disabled));
    expect(offManifests.filter((m: any) => m.kind === 'HelmChart' && m.metadata?.name === 'tempo')).toHaveLength(0);
    expect(offManifests.filter((m: any) => m.kind === 'HelmChart' && m.metadata?.name === 'alloy-traces')).toHaveLength(0);
  });
});
