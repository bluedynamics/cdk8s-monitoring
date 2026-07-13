/**
 * Resource allocation for a component (CPU and memory)
 */
export interface ResourceAllocation {
  cpu: string;
  memory: string;
}

/**
 * Resource requests and limits for a component
 */
export interface ResourceRequirements {
  requests: ResourceAllocation;
  limits: ResourceAllocation;
}

/**
 * S3 configuration for object storage
 */
export interface S3Config {
  endpoint: string; // Full endpoint with protocol (e.g., https://fsn1.your-objectstorage.com)
  endpointNoProtocol: string; // Endpoint without protocol (for Thanos)
  region: string; // S3 region (e.g., fsn1)
  buckets: {
    thanos: string; // Thanos metrics bucket
    loki: string; // Loki logs bucket
  };
}

/**
 * SMTP configuration for alerting
 */
export interface SmtpConfig {
  host: string; // SMTP server hostname
  port: number; // SMTP server port
  from: string; // From email address
  username?: string; // SMTP username (optional)
  password?: string; // SMTP password (optional)
  requireTls: boolean; // Require TLS for SMTP
}

/**
 * Domain configuration for ingresses
 */
export interface DomainConfig {
  grafana: string; // Grafana domain (e.g., grafana.ops.kup6s.net)
  ingressClassName?: string; // IngressClass for the Grafana ingress; omit to rely on the cluster's default IngressClass
}

/**
 * Names of the external Crossplane and External Secrets Operator resources this
 * stack references. These are not created by the library; they must already exist
 * in your cluster. There are no defaults — every consumer wires its own names.
 */
export interface IntegrationsConfig {
  s3ProviderConfig: string; // Crossplane ProviderConfig name the Bucket resources reconcile against
  s3SecretStore: string; // ESO ClusterSecretStore name holding the S3 credentials
  s3CredentialsKey: string; // Remote key in the store to extract S3 credentials from (provides AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
  grafanaSecretStore: string; // ESO ClusterSecretStore name holding the Grafana admin credentials
  grafanaCredentialsKey: string; // Remote key in the store to extract the Grafana admin credentials from
}

/**
 * Retention policies for metrics and logs
 */
export interface RetentionConfig {
  prometheus: string; // Prometheus local retention (e.g., "3d")
  prometheusS3Raw: number; // Thanos raw data retention (days)
  prometheusS35m: number; // Thanos 5-minute downsampled retention (days)
  prometheusS31h: number; // Thanos 1-hour downsampled retention (days)
  loki: string; // Loki retention (e.g., "744h" for 31 days)
}

/**
 * Storage sizes for persistent volumes
 */
export interface StorageConfig {
  prometheus: string; // Prometheus PVC size
  grafana: string; // Grafana PVC size
  alertmanager: string; // Alertmanager PVC size
  lokiBackend: string; // Loki backend PVC size
  lokiWrite: string; // Loki write PVC size
  thanosStore: string; // Thanos store PVC size (per replica)
  thanosCompactor: string; // Thanos compactor PVC size
  tempo: string; // Tempo WAL/local-blocks PVC size
}

/**
 * Replica counts for high availability
 */
export interface ReplicaConfig {
  prometheus: number; // Prometheus replicas
  alertmanager: number; // Alertmanager replicas
  grafana: number; // Grafana replicas (usually 1)
  lokiBackend: number; // Loki backend replicas
  lokiRead: number; // Loki read replicas
  lokiWrite: number; // Loki write replicas
  thanosQuery: number; // Thanos Query replicas
  thanosStore: number; // Thanos Store replicas
  tempo: number; // Tempo replicas
}

/**
 * Resource requirements for all components
 */
export interface ResourceConfig {
  prometheus: ResourceRequirements;
  grafana: ResourceRequirements;
  alertmanager: ResourceRequirements;
  lokiBackend: ResourceRequirements;
  lokiRead: ResourceRequirements;
  lokiWrite: ResourceRequirements;
  lokiGateway: ResourceRequirements;
  alloy: ResourceRequirements;
  thanosQuery: ResourceRequirements;
  thanosStore: ResourceRequirements;
  thanosCompactor: ResourceRequirements;
  // Sidecar containers (added 2025-11-18)
  configReloader: ResourceRequirements; // config-reloader sidecar (Prometheus, Alertmanager, Alloy)
  thanosSidecar: ResourceRequirements; // thanos-sidecar for Prometheus
  tempo: ResourceRequirements; // Tempo (monolithic)
  alloyTraces: ResourceRequirements; // Alloy traces OTLP gateway
}

/**
 * Helm chart version configuration
 */
export interface VersionConfig {
  prometheusStack: string; // kube-prometheus-stack chart version (e.g., "latest" or "65.0.0")
  loki: string; // Loki chart version
  alloy: string; // Alloy chart version
  thanos: string; // Thanos image version (e.g., "v0.36.1")
  tempo: string; // grafana/tempo chart version
}

/**
 * Tail-sampling policy for the Alloy traces gateway.
 */
export interface TempoTailSamplingConfig {
  latencyThresholdMs: number; // keep traces slower than this
  probabilisticPercent: number; // keep this % of the remaining ("normal") traces
}

/**
 * Grafana Tempo tracing configuration (opt-in).
 */
export interface TempoConfig {
  enabled: boolean; // default false — when false, no Tempo resources are created
  bucket: string; // S3 bucket for traces (required when enabled)
  retention: string; // block retention, e.g. '336h' (14 days)
  tailSampling: TempoTailSamplingConfig;
}

/**
 * Traefik ingress-controller monitoring (generic infra, opt-in).
 * PodMonitor (not ServiceMonitor: the k3s-bundled Traefik exposes the metrics
 * port on the Pod, not the Service) plus an optional Grafana dashboard.
 */
export interface TraefikConfig {
  enabled: boolean; // default false — when false, no Traefik monitoring resources are created
  namespace: string; // namespace Traefik runs in (PodMonitor namespaceSelector); default 'traefik'
  dashboard: boolean; // ship the Traefik Grafana dashboard ConfigMap; default true
}

/**
 * Longhorn storage monitoring (generic infra, opt-in).
 * ServiceMonitor for longhorn-manager metrics plus optional volume-health alerts.
 */
export interface LonghornConfig {
  enabled: boolean; // default false — when false, no Longhorn monitoring resources are created
  namespace: string; // namespace Longhorn runs in (ServiceMonitor namespaceSelector); default 'longhorn-system'
  alerts: boolean; // ship the volume-health PrometheusRule; default true
}

/**
 * Configuration the package ships sensible defaults for.
 * Integration charts may override any of these (deep-merged over DEFAULT_CONFIG).
 */
export interface DefaultableConfig {
  versions: VersionConfig; // Chart and image versions
  retention: RetentionConfig; // Data retention policies
  storage: StorageConfig; // PVC storage sizes
  replicas: ReplicaConfig; // Replica counts
  resources: ResourceConfig; // Resource requests and limits
  tempo: TempoConfig; // Grafana Tempo tracing (opt-in)
  traefik: TraefikConfig; // Traefik ingress monitoring (opt-in)
  longhorn: LonghornConfig; // Longhorn storage monitoring (opt-in)
}

/**
 * Cluster-specific configuration with no sensible universal default.
 * Integration charts must provide these.
 */
export interface RequiredClusterConfig {
  namespace: string; // Kubernetes namespace
  clusterName: string; // value of the `cluster` external label on metrics and logs
  domains: DomainConfig; // Domain names for ingresses
  s3: S3Config; // S3 object storage configuration
  smtp: SmtpConfig; // SMTP alerting configuration
  integrations: IntegrationsConfig; // Names of external Crossplane/ESO resources to reference
}

/**
 * Recursive partial — every property (including nested ones) becomes optional.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Input accepted by mergeConfig: required cluster values plus optional,
 * deeply-partial overrides of the package defaults.
 */
export type MonitoringConfigInput = RequiredClusterConfig & DeepPartial<DefaultableConfig>;

/**
 * Complete, resolved monitoring stack configuration consumed by MonitoringChart.
 */
export interface MonitoringConfig extends RequiredClusterConfig, DefaultableConfig {}
