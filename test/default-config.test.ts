import { DEFAULT_CONFIG, mergeConfig } from '../src/default-config';
import { MonitoringConfigInput } from '../src/types';

const cluster: MonitoringConfigInput = {
  namespace: 'monitoring',
  domains: { grafana: 'grafana.example.com' },
  s3: {
    endpoint: 'https://s3.example.com',
    endpointNoProtocol: 's3.example.com',
    region: 'eu',
    buckets: { thanos: 'thanos-b', loki: 'loki-b' },
  },
  smtp: { host: 'mail.example.com', port: 587, from: 'm@example.com', requireTls: true },
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
