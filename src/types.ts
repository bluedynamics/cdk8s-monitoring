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
}

/**
 * Helm chart version configuration
 */
export interface VersionConfig {
  prometheusStack: string; // kube-prometheus-stack chart version (e.g., "latest" or "65.0.0")
  loki: string; // Loki chart version
  alloy: string; // Alloy chart version
  thanos: string; // Thanos image version (e.g., "v0.36.1")
}

/**
 * Complete monitoring stack configuration
 */
export interface MonitoringConfig {
  namespace: string; // Kubernetes namespace
  versions: VersionConfig; // Chart and image versions
  domains: DomainConfig; // Domain names for ingresses
  s3: S3Config; // S3 object storage configuration
  smtp: SmtpConfig; // SMTP alerting configuration
  retention: RetentionConfig; // Data retention policies
  storage: StorageConfig; // PVC storage sizes
  replicas: ReplicaConfig; // Replica counts
  resources: ResourceConfig; // Resource requests and limits
}
