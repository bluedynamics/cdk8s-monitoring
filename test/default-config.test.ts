import { DEFAULT_CONFIG, mergeConfig } from '../src/default-config';
import { MonitoringConfigInput } from '../src/types';

const cluster: MonitoringConfigInput = {
  namespace: 'monitoring',
  clusterName: 'test-cluster',
  domains: { grafana: 'grafana.example.com' },
  s3: {
    endpoint: 'https://s3.example.com',
    endpointNoProtocol: 's3.example.com',
    region: 'eu',
    buckets: { thanos: 'thanos-b', loki: 'loki-b' },
  },
  smtp: { host: 'mail.example.com', port: 587, from: 'm@example.com', requireTls: true },
  integrations: {
    s3ProviderConfig: 's3p',
    s3SecretStore: 's3store',
    s3CredentialsKey: 's3key',
    grafanaSecretStore: 'gstore',
    grafanaCredentialsKey: 'gkey',
  },
};

test('applies package defaults when no overrides are given', () => {
  const cfg = mergeConfig(cluster);
  expect(cfg.versions).toEqual(DEFAULT_CONFIG.versions);
  expect(cfg.resources.prometheus.limits.memory).toBe(DEFAULT_CONFIG.resources.prometheus.limits.memory);
  expect(cfg.replicas.prometheus).toBe(DEFAULT_CONFIG.replicas.prometheus);
});

test('passes required cluster config through unchanged', () => {
  const cfg = mergeConfig(cluster);
  expect(cfg.namespace).toBe('monitoring');
  expect(cfg.domains.grafana).toBe('grafana.example.com');
  expect(cfg.s3.buckets.thanos).toBe('thanos-b');
});

test('passes integrations config through unchanged', () => {
  const cfg = mergeConfig(cluster);
  expect(cfg.integrations).toEqual(cluster.integrations);
});

test('deep-overrides a single nested field, keeping siblings at default', () => {
  const cfg = mergeConfig({
    ...cluster,
    resources: { prometheus: { limits: { memory: '9000Mi' } } } as any,
  });
  expect(cfg.resources.prometheus.limits.memory).toBe('9000Mi');
  expect(cfg.resources.prometheus.limits.cpu).toBe(DEFAULT_CONFIG.resources.prometheus.limits.cpu);
  expect(cfg.resources.prometheus.requests.cpu).toBe(DEFAULT_CONFIG.resources.prometheus.requests.cpu);
  expect(cfg.resources.grafana.limits.memory).toBe(DEFAULT_CONFIG.resources.grafana.limits.memory);
});

test('defaults tempo to disabled with sane sampling values', () => {
  const cfg = mergeConfig(cluster);
  expect(cfg.tempo.enabled).toBe(false);
  expect(cfg.tempo.retention).toBe('336h');
  expect(cfg.tempo.tailSampling.latencyThresholdMs).toBe(1000);
  expect(cfg.tempo.tailSampling.probabilisticPercent).toBe(10);
  expect(cfg.versions.tempo).toBeDefined();
  expect(cfg.replicas.tempo).toBe(1);
  expect(cfg.storage.tempo).toBe('5Gi');
  expect(cfg.resources.tempo.limits.memory).toBeDefined();
  expect(cfg.resources.alloyTraces.limits.memory).toBeDefined();
});

test('deep-merges tempo overrides, keeping sibling defaults', () => {
  const cfg = mergeConfig({
    ...cluster,
    tempo: { enabled: true, bucket: 'traces-b', tailSampling: { latencyThresholdMs: 2000 } } as any,
  });
  expect(cfg.tempo.enabled).toBe(true);
  expect(cfg.tempo.bucket).toBe('traces-b');
  expect(cfg.tempo.tailSampling.latencyThresholdMs).toBe(2000);
  expect(cfg.tempo.tailSampling.probabilisticPercent).toBe(10);
  expect(cfg.tempo.retention).toBe('336h');
});

test('throws when tempo is enabled without a bucket', () => {
  expect(() => mergeConfig({ ...cluster, tempo: { enabled: true } as any })).toThrow(/tempo\.bucket/);
});

test('leaves embedding disabled by default', () => {
  const cfg = mergeConfig(cluster);
  expect(cfg.embedding.enabled).toBe(false);
  expect(cfg.embedding.frameAncestors).toEqual([]);
});

test('throws when embedding is enabled without frame ancestors', () => {
  expect(() => mergeConfig({ ...cluster, embedding: { enabled: true } as any }))
    .toThrow(/embedding\.frameAncestors/);
});

test('passes clusterName through unchanged', () => {
  const cfg = mergeConfig({ ...cluster, clusterName: 'my-cluster' } as any);
  expect(cfg.clusterName).toBe('my-cluster');
});
