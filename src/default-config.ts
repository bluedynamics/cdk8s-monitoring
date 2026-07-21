import { deepmerge } from 'deepmerge-ts';
import {
  DefaultableConfig, MonitoringConfig, MonitoringConfigInput,
  VersionConfig, RetentionConfig, StorageConfig, ReplicaConfig, ResourceConfig, TempoConfig,
  TraefikConfig, LonghornConfig, EmbeddingConfig,
} from './types';

/**
 * Package-shipped defaults for everything that has a sensible universal value.
 * Values mirror the kup6s production config at the time of extraction; integration
 * charts override only what they need via {@link mergeConfig}.
 */
export const DEFAULT_CONFIG: DefaultableConfig = {
  versions: {
    prometheusStack: '87.0.0',
    loki: '7.0.0',
    alloy: '1.10.0',
    thanos: 'v0.41.0',
    tempo: '1.24.4', // grafana/tempo chart (Tempo app 2.9.0)
  },
  retention: {
    prometheus: '2d',
    prometheusS3Raw: 30,
    prometheusS35m: 180,
    prometheusS31h: 730,
    loki: '744h',
  },
  storage: {
    prometheus: '15Gi',
    grafana: '5Gi',
    alertmanager: '1Gi',
    lokiBackend: '10Gi',
    lokiWrite: '3Gi',
    thanosStore: '10Gi',
    thanosCompactor: '20Gi',
    tempo: '5Gi',
  },
  replicas: {
    prometheus: 2,
    alertmanager: 2,
    grafana: 1,
    lokiBackend: 2,
    lokiRead: 2,
    lokiWrite: 2,
    thanosQuery: 2,
    thanosStore: 2,
    tempo: 1,
  },
  resources: {
    prometheus: { requests: { cpu: '100m', memory: '1500Mi' }, limits: { cpu: '2', memory: '3000Mi' } },
    grafana: { requests: { cpu: '50m', memory: '512Mi' }, limits: { cpu: '200m', memory: '1Gi' } },
    alertmanager: { requests: { cpu: '25m', memory: '100Mi' }, limits: { cpu: '100m', memory: '200Mi' } },
    lokiBackend: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
    lokiRead: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
    lokiWrite: { requests: { cpu: '100m', memory: '512Mi' }, limits: { cpu: '1', memory: '1Gi' } },
    lokiGateway: { requests: { cpu: '50m', memory: '128Mi' }, limits: { cpu: '200m', memory: '256Mi' } },
    alloy: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '200m', memory: '256Mi' } },
    thanosQuery: { requests: { cpu: '200m', memory: '512Mi' }, limits: { cpu: '1000m', memory: '1Gi' } },
    thanosStore: { requests: { cpu: '200m', memory: '1Gi' }, limits: { cpu: '1000m', memory: '2Gi' } },
    thanosCompactor: { requests: { cpu: '500m', memory: '2Gi' }, limits: { cpu: '2000m', memory: '4Gi' } },
    configReloader: { requests: { cpu: '10m', memory: '50Mi' }, limits: { cpu: '50m', memory: '100Mi' } },
    thanosSidecar: { requests: { cpu: '10m', memory: '50Mi' }, limits: { cpu: '100m', memory: '100Mi' } },
    tempo: { requests: { cpu: '100m', memory: '512Mi' }, limits: { cpu: '1', memory: '2Gi' } },
    alloyTraces: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
  },
  tempo: {
    enabled: false,
    bucket: '',
    retention: '336h',
    tailSampling: { latencyThresholdMs: 1000, probabilisticPercent: 10 },
  },
  traefik: {
    enabled: false,
    namespace: 'traefik',
    dashboard: true,
  },
  longhorn: {
    enabled: false,
    namespace: 'longhorn-system',
    alerts: true,
  },
  embedding: {
    enabled: false,
    frameAncestors: [],
  },
};

/**
 * Resolve a full MonitoringConfig by deep-merging the caller's overrides over
 * DEFAULT_CONFIG. Required cluster values are passed through verbatim.
 */
export function mergeConfig(input: MonitoringConfigInput): MonitoringConfig {
  const tempo = deepmerge(DEFAULT_CONFIG.tempo, input.tempo ?? {}) as TempoConfig;
  if (tempo.enabled && !tempo.bucket) {
    throw new Error('tempo.bucket is required when tempo.enabled is true');
  }
  const traefik = deepmerge(DEFAULT_CONFIG.traefik, input.traefik ?? {}) as TraefikConfig;
  if (traefik.enabled && !traefik.namespace) {
    throw new Error('traefik.namespace is required when traefik.enabled is true');
  }
  const longhorn = deepmerge(DEFAULT_CONFIG.longhorn, input.longhorn ?? {}) as LonghornConfig;
  if (longhorn.enabled && !longhorn.namespace) {
    throw new Error('longhorn.namespace is required when longhorn.enabled is true');
  }
  const embedding = deepmerge(DEFAULT_CONFIG.embedding, input.embedding ?? {}) as EmbeddingConfig;
  if (embedding.enabled && embedding.frameAncestors.length === 0) {
    throw new Error('embedding.frameAncestors must name at least one origin when embedding.enabled is true');
  }
  return {
    namespace: input.namespace,
    clusterName: input.clusterName,
    domains: input.domains,
    s3: input.s3,
    smtp: input.smtp,
    integrations: input.integrations,
    versions: deepmerge(DEFAULT_CONFIG.versions, input.versions ?? {}) as VersionConfig,
    retention: deepmerge(DEFAULT_CONFIG.retention, input.retention ?? {}) as RetentionConfig,
    storage: deepmerge(DEFAULT_CONFIG.storage, input.storage ?? {}) as StorageConfig,
    replicas: deepmerge(DEFAULT_CONFIG.replicas, input.replicas ?? {}) as ReplicaConfig,
    resources: deepmerge(DEFAULT_CONFIG.resources, input.resources ?? {}) as ResourceConfig,
    tempo,
    traefik,
    longhorn,
    embedding,
  };
}
