import { Testing } from 'cdk8s';
import { MonitoringConfig } from '../src/types';

/**
 * Create a minimal test configuration for monitoring stack.
 * This provides sensible defaults that can be overridden for specific tests.
 */
export function createTestConfig(overrides?: Partial<MonitoringConfig>): MonitoringConfig {
  const defaultConfig: MonitoringConfig = {
    namespace: 'monitoring',
    clusterName: 'test-cluster',

    versions: {
      prometheusStack: 'v69.2.0',
      loki: '6.23.0',
      alloy: 'v1.6.1',
      thanos: 'v0.37.2',
      tempo: 'latest',
    },

    domains: {
      grafana: 'grafana.example.com',
    },

    s3: {
      endpoint: 'https://s3.example.com',
      endpointNoProtocol: 's3.example.com',
      region: 'us-east-1',
      buckets: {
        thanos: 'metrics-thanos-test',
        loki: 'logs-loki-test',
      },
    },

    smtp: {
      host: 'smtp.example.com',
      port: 587,
      from: 'alerts@example.com',
      username: 'test-user',
      password: 'test-pass',
      requireTls: true,
    },

    integrations: {
      s3ProviderConfig: 'test-s3-provider',
      s3SecretStore: 'test-s3-store',
      s3CredentialsKey: 'test-s3-creds',
      grafanaSecretStore: 'test-grafana-store',
      grafanaCredentialsKey: 'test-grafana-creds',
    },

    retention: {
      prometheus: '3d',
      prometheusS3Raw: 30,
      prometheusS35m: 180,
      prometheusS31h: 730,
      loki: '744h',
    },

    storage: {
      prometheus: '3Gi',
      grafana: '10Gi',
      alertmanager: '1Gi',
      lokiBackend: '10Gi',
      lokiWrite: '10Gi',
      thanosStore: '10Gi',
      thanosCompactor: '20Gi',
      tempo: '5Gi',
    },

    replicas: {
      prometheus: 2,
      alertmanager: 3,
      grafana: 1,
      lokiBackend: 1,
      lokiRead: 2,
      lokiWrite: 2,
      thanosQuery: 2,
      thanosStore: 2,
      tempo: 1,
    },

    resources: {
      prometheus: {
        requests: { cpu: '100m', memory: '1500Mi' },
        limits: { cpu: '2000m', memory: '3000Mi' },
      },
      grafana: {
        requests: { cpu: '50m', memory: '512Mi' },
        limits: { cpu: '500m', memory: '1024Mi' },
      },
      alertmanager: {
        requests: { cpu: '25m', memory: '100Mi' },
        limits: { cpu: '250m', memory: '256Mi' },
      },
      lokiBackend: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
      lokiRead: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
      lokiWrite: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
      lokiGateway: {
        requests: { cpu: '50m', memory: '128Mi' },
        limits: { cpu: '200m', memory: '256Mi' },
      },
      alloy: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
      thanosQuery: {
        requests: { cpu: '25m', memory: '128Mi' },
        limits: { cpu: '250m', memory: '512Mi' },
      },
      thanosStore: {
        requests: { cpu: '25m', memory: '256Mi' },
        limits: { cpu: '250m', memory: '1024Mi' },
      },
      thanosCompactor: {
        requests: { cpu: '25m', memory: '256Mi' },
        limits: { cpu: '250m', memory: '1024Mi' },
      },
      configReloader: {
        requests: { cpu: '10m', memory: '50Mi' },
        limits: { cpu: '50m', memory: '100Mi' },
      },
      thanosSidecar: {
        requests: { cpu: '10m', memory: '50Mi' },
        limits: { cpu: '100m', memory: '100Mi' },
      },
      tempo: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '1', memory: '1Gi' },
      },
      alloyTraces: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
    },

    tempo: {
      // Disabled by default so base-stack tests see no extra resources;
      // tempo-specific tests enable it explicitly. bucket stays set so the
      // direct construct tests (which ignore `enabled`) have a value.
      enabled: false,
      bucket: 'traces-tempo-test',
      retention: '336h',
      tailSampling: { latencyThresholdMs: 1000, probabilisticPercent: 10 },
    },
  };

  return { ...defaultConfig, ...overrides };
}

/**
 * Synthesize a chart and return the generated manifests as parsed objects.
 */
export function synthesizeChart(chart: any): any[] {
  const manifests = Testing.synth(chart);
  // Testing.synth() returns objects, not strings
  return manifests;
}

/**
 * Find a specific resource by kind and name in synthesized manifests.
 */
export function findResource(
  manifests: any[],
  kind: string,
  name?: string,
): any | undefined {
  return manifests.find((m) => {
    if (m.kind !== kind) return false;
    if (name && m.metadata?.name !== name) return false;
    return true;
  });
}

/**
 * Find all resources of a specific kind in synthesized manifests.
 */
export function findResourcesByKind(manifests: any[], kind: string): any[] {
  return manifests.filter((m) => m.kind === kind);
}

/**
 * Assert that a resource has the expected labels.
 */
export function expectLabels(
  resource: any,
  expectedLabels: Record<string, string>,
): void {
  const actualLabels = resource.metadata?.labels || {};
  for (const [key, value] of Object.entries(expectedLabels)) {
    if (actualLabels[key] !== value) {
      throw new Error(
        `Expected label ${key}=${value}, got ${key}=${actualLabels[key]}`,
      );
    }
  }
}

/**
 * Assert that a resource has the expected annotations.
 */
export function expectAnnotations(
  resource: any,
  expectedAnnotations: Record<string, string>,
): void {
  const actualAnnotations = resource.metadata?.annotations || {};
  for (const [key, value] of Object.entries(expectedAnnotations)) {
    if (actualAnnotations[key] !== value) {
      throw new Error(
        `Expected annotation ${key}=${value}, got ${key}=${actualAnnotations[key]}`,
      );
    }
  }
}

/**
 * Assert that a resource has the expected sync-wave annotation.
 */
export function expectSyncWave(resource: any, expectedWave: string): void {
  expectAnnotations(resource, { 'argocd.argoproj.io/sync-wave': expectedWave });
}

/**
 * Get all container specs from a pod template spec.
 */
export function getContainers(podSpec: any): any[] {
  return podSpec.containers || [];
}

/**
 * Find a container by name in a pod spec.
 */
export function findContainer(podSpec: any, name: string): any | undefined {
  return getContainers(podSpec).find((c) => c.name === name);
}

/**
 * Assert that a container has expected resource requests/limits.
 */
export function expectContainerResources(
  container: any,
  expectedRequests: { cpu?: string; memory?: string },
  expectedLimits: { cpu?: string; memory?: string },
): void {
  const actualRequests = container.resources?.requests || {};
  const actualLimits = container.resources?.limits || {};

  for (const [key, value] of Object.entries(expectedRequests)) {
    if (actualRequests[key] !== value) {
      throw new Error(
        `Expected request ${key}=${value}, got ${key}=${actualRequests[key]}`,
      );
    }
  }

  for (const [key, value] of Object.entries(expectedLimits)) {
    if (actualLimits[key] !== value) {
      throw new Error(
        `Expected limit ${key}=${value}, got ${key}=${actualLimits[key]}`,
      );
    }
  }
}

/**
 * Assert that a volume mount exists with expected properties.
 */
export function expectVolumeMount(
  container: any,
  name: string,
  mountPath: string,
  readOnly?: boolean,
): void {
  const volumeMounts = container.volumeMounts || [];
  const mount = volumeMounts.find((vm: any) => vm.name === name);

  if (!mount) {
    throw new Error(`Volume mount ${name} not found`);
  }

  if (mount.mountPath !== mountPath) {
    throw new Error(
      `Expected mountPath ${mountPath}, got ${mount.mountPath}`,
    );
  }

  if (readOnly !== undefined && mount.readOnly !== readOnly) {
    throw new Error(`Expected readOnly ${readOnly}, got ${mount.readOnly}`);
  }
}

/**
 * Assert that a volume exists in pod spec.
 */
export function expectVolume(podSpec: any, name: string, _type?: string): any {
  const volumes = podSpec.volumes || [];
  const volume = volumes.find((v: any) => v.name === name);

  if (!volume) {
    throw new Error(`Volume ${name} not found`);
  }

  return volume;
}
