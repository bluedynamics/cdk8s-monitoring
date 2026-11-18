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
 * Reference to a Secret holding the SMTP password.
 *
 * The secret must live in the monitoring namespace. Prometheus Operator mounts
 * it into the Alertmanager pod, and Alertmanager reads the password from the
 * mounted file rather than from its configuration.
 */
export interface SmtpPasswordSecret {
  name: string; // Secret name in the monitoring namespace
  key: string; // Key within that secret holding the password
}

/**
 * SMTP configuration for alerting
 */
export interface SmtpConfig {
  host: string; // SMTP server hostname
  port: number; // SMTP server port
  from: string; // From email address
  username?: string; // SMTP username (optional)
  /**
   * SMTP password as a literal.
   *
   * Renders into the generated Alertmanager configuration in clear text, so
   * anything that commits the synthesized manifests commits the password with
   * them. Prefer `passwordSecret`; this field remains for compatibility.
   */
  password?: string;
  /**
   * Read the SMTP password from a mounted secret instead of embedding it.
   *
   * Takes precedence over `password`.
   */
  passwordSecret?: SmtpPasswordSecret;
  requireTls: boolean; // Require TLS for SMTP
  /**
   * Alert recipients. Defaults to `[from]` when unset.
   *
   * Alertmanager accepts several addresses per receiver, so a distribution list
   * is not required to reach more than one person.
   */
  recipients?: string[];
  /**
   * Extra mail headers on every notification, e.g. a relay's switches for click
   * and open tracking. Header names are passed through as given.
   */
  headers?: Record<string, string>;
}

/**
 * Domain configuration for ingresses
 */
export interface DomainConfig {
  grafana: string; // Grafana domain (e.g., grafana.ops.kup6s.net)
  ingressClassName?: string; // IngressClass for the Grafana ingress; omit to rely on the cluster's default IngressClass
  /**
   * Create the Grafana Ingress (default true). Set false when Grafana is reached
   * some other way, e.g. through a VPN proxy in front of its Service.
   */
  grafanaIngress?: boolean;
  /** Grafana root_url; defaults to https://<grafana>. Links and redirects are built from it. */
  grafanaRootUrl?: string;
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
  /**
   * StorageClass of every PVC in the stack; default 'longhorn'.
   * An empty string omits the field, so the cluster's default StorageClass applies.
   */
  className: string;
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
  alloyAudit: ResourceRequirements; // Alloy audit log collector on the control planes
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
  blackboxExporter: string; // prometheus-community/prometheus-blackbox-exporter chart version
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
/**
 * Kubernetes API audit log collection (opt-in).
 *
 * A dedicated Alloy DaemonSet on the control planes tails the live audit file the
 * API server writes to `path` and ships it to Loki as `job="k3s-audit"`.
 * The consumer enables audit logging on the API server itself (for k3s:
 * `audit-policy-file` and `audit-log-path`); this library only collects the files.
 */
export interface AuditLogConfig {
  enabled: boolean; // default false — when false, no collector is created
  path: string; // default /var/log/k3s-audit — directory with the audit log files on the control planes
  file: string; // default audit.log — the live file in that directory; rotated copies are never read
  nodeSelector: { [key: string]: string }; // default node-role.kubernetes.io/control-plane: "true"
}

export interface TraefikConfig {
  enabled: boolean; // default false — when false, no Traefik monitoring resources are created
  namespace: string; // namespace Traefik runs in (PodMonitor namespaceSelector); default 'traefik'
  dashboard: boolean; // ship the Traefik Grafana dashboard ConfigMap; default true
}

/**
 * Scheduling priority of the stack's pods, split by role.
 *
 * The capture path (Prometheus, Alertmanager, the operator, node-exporter,
 * kube-state-metrics, Loki write/backend/gateway, Alloy, Tempo) loses data or
 * alerts when it is evicted, so it outranks the query path (Grafana, Thanos
 * Query/Store/Compactor, Loki read), which may wait while a node is short of
 * memory. Both default to the library's own `high-priority` class (value 10000).
 * Clusters with their own tiering set `create: false` and name their classes.
 */
export interface PriorityClassesConfig {
  create: boolean; // create the `high-priority` PriorityClass in wave 0; default true
  capture: string; // class for pods that ingest data or route alerts; default 'high-priority'
  query: string; // class for pods that only serve queries; default 'high-priority'
}

/**
 * Longhorn storage monitoring (generic infra, opt-in).
 * ServiceMonitor for longhorn-manager metrics plus optional volume-health alerts.
 */
export interface LonghornConfig {
  enabled: boolean; // default false — when false, no Longhorn monitoring resources are created
  namespace: string; // namespace Longhorn runs in (ServiceMonitor namespaceSelector); default 'longhorn-system'
  alerts: boolean; // ship the volume-health PrometheusRule; default true
  backupAlerts: LonghornBackupAlertsConfig; // failed and stale backups (opt-in)
}

/**
 * Alerts on CloudNativePG clusters backed up by the barman-cloud plugin (opt-in).
 * kube-state-metrics reads the base backup times from the status of the
 * barman ObjectStores; WAL archiving comes from CNPG's own pg_stat_archiver
 * metrics, so the clusters need their PodMonitor.
 */
export interface CnpgBackupsConfig {
  enabled: boolean; // default false — when false, no CNPG backup rules and no ObjectStore metrics
  maxAgeHours: number; // last successful base backup of a running cluster older than this alerts; default 30
}

/**
 * Alerts on failed and stale Longhorn backups (opt-in, needs recurring backup jobs).
 * Volumes of an exempt recurring-job group are recognized by their PVC label
 * `recurring-job-group.longhorn.io/<group>: enabled`, which kube-state-metrics
 * then exports; a label set only on the Longhorn volume is not seen.
 */
export interface LonghornBackupAlertsConfig {
  enabled: boolean; // default false — when false, no backup PrometheusRule is created
  maxAgeHours: number; // last backup of an attached volume older than this alerts; default 30 (daily job plus slack)
  exemptGroups: string[]; // recurring-job groups whose volumes are not backed up on purpose; default []
}

/**
 * ArgoCD GitOps monitoring (generic infra, opt-in).
 * PodMonitor for the application controller (the argo-helm chart exposes its
 * metrics Service only with controller.metrics.enabled, the Pod port always)
 * plus optional alerts on applications ArgoCD can no longer compare with Git.
 */
export interface ArgoCdConfig {
  enabled: boolean; // default false — when false, no ArgoCD monitoring resources are created
  namespace: string; // namespace ArgoCD runs in (PodMonitor namespaceSelector); default 'argocd'
  alerts: boolean; // ship the GitOps PrometheusRule; default true
}

/**
 * cert-manager monitoring (generic infra, opt-in).
 * ServiceMonitor for the controller plus optional alerts on certificates that
 * are not ready, overdue for renewal, or about to expire.
 */
export interface CertManagerConfig {
  enabled: boolean; // default false — when false, no cert-manager monitoring resources are created
  namespace: string; // namespace cert-manager runs in (ServiceMonitor namespaceSelector); default 'cert-manager'
  alerts: boolean; // ship the cert-manager PrometheusRule; default true
}

/**
 * Blackbox probes of public endpoints (opt-in): a blackbox-exporter plus Probe
 * resources and alerts on failed probes and expiring certificates.
 */
export interface BlackboxConfig {
  enabled: boolean; // default false — when false, no exporter, probes or rules
  httpTargets: string[]; // URLs fetched with GET; redirects followed, 2xx and a valid certificate expected
  tlsTargets: string[]; // host:port that only complete a TLS handshake (IMAPS, SMTPS)
  alerts: boolean; // ship the blackbox PrometheusRule; default true
  certWarningDays: number; // warn when a served certificate expires within this many days; default 14
}

/**
 * Browser embedding of Grafana in an <iframe> (opt-in).
 *
 * Grafana refuses framing by default (`X-Frame-Options: deny`), which also
 * blocks externally shared ("public") dashboards. Enabling this drops that
 * header and replaces it with a Content-Security-Policy whose `frame-ancestors`
 * names exactly the origins allowed to frame Grafana — the whole instance,
 * including the authenticated UI, so keep the list tight.
 */
export interface EmbeddingConfig {
  enabled: boolean; // default false — when false, Grafana keeps its X-Frame-Options: deny
  frameAncestors: string[]; // origins allowed to frame Grafana, e.g. 'https://console.example.com'; 'self' is always included
}

/**
 * Demoted alert routing for staging namespaces sharing this cluster's
 * monitoring stack (opt-in).
 *
 * Alerts whose `namespace` label matches one of the listed namespaces are
 * routed to a separate `staging` email receiver whose subject carries a
 * `[STAGING]` prefix, instead of the production receiver — so they stay
 * visible but never read like a production page.
 */
export interface StagingAlertsConfig {
  enabled: boolean; // default false — when false, all namespaces route to the production receiver
  namespaces: string[]; // namespaces whose alerts are demoted, e.g. 'myapp-stage'
}

/**
 * A key in a Secret of the monitoring namespace that Alertmanager reads from a
 * mounted file, so the value never reaches the synthesized manifests.
 */
export interface SecretKeyRef {
  name: string;
  key: string;
}

/**
 * Forwarding of the always-firing `Watchdog` alert to an external dead man's
 * switch such as a Healthchecks check (opt-in).
 *
 * Alertmanager posts the alert to the webhook every `repeatInterval`. The
 * external service raises the alarm when the posts stop, which is exactly when
 * this stack can no longer notify anyone itself: Prometheus, Alertmanager, the
 * mail relay, or the whole cluster is down.
 */
export interface DeadMansSwitchConfig {
  enabled: boolean; // default false — when false, Watchdog goes to the null receiver
  urlSecret: SecretKeyRef; // Secret key holding the webhook URL; the URL is a credential (anyone who knows it can report "alive")
  repeatInterval: string; // default '5m' — keep it well below the grace period of the external check
}

/**
 * Browser-facing URLs of Alertmanager and Prometheus (or a Thanos Query in
 * front of it). Notifications link to them: Alertmanager's own link, and each
 * alert's source link, which Prometheus builds from its external URL.
 * An empty string keeps the operator default, the in-cluster Service address.
 */
export interface ExternalUrlsConfig {
  alertmanager: string; // e.g. 'https://alertmanager.example.com'
  prometheus: string; // e.g. 'https://metrics.example.com'; a Thanos Query understands the same /graph links
}

/**
 * Alertmanager notification pacing.
 */
export interface AlertRoutingConfig {
  /**
   * How often a still-firing alert group is mailed again (Alertmanager `repeat_interval`).
   * Default 12h: an hourly repeat turns every long-standing alert into a mail flood
   * that gets the channel muted.
   */
  repeatInterval: string;
  criticalPush: CriticalPushConfig; // second channel for critical alerts (opt-in)
}

/**
 * Sends critical alerts to a webhook as well as by mail, for a channel that
 * reaches someone at night (for example an ntfy topic). The webhook also
 * carries the critical alert that mail delivery itself fails
 * (AlertmanagerClusterFailedToSendAlerts).
 */
export interface CriticalPushConfig {
  enabled: boolean; // default false
  url: string; // webhook URL, for example https://ntfy.example.com/topic?template=alertmanager
  tokenSecret: SecretKeyRef; // Secret key holding the bearer token for the webhook
  repeatInterval: string; // how often a still-firing critical group is sent again; default '4h'
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
  argocd: ArgoCdConfig; // ArgoCD GitOps monitoring (opt-in)
  certManager: CertManagerConfig; // cert-manager certificate monitoring (opt-in)
  blackbox: BlackboxConfig; // blackbox probes of public endpoints (opt-in)
  auditLog: AuditLogConfig; // Kubernetes API audit log collection (opt-in)
  embedding: EmbeddingConfig; // Grafana iframe embedding (opt-in)
  stagingAlerts: StagingAlertsConfig; // demoted alert routing for staging namespaces (opt-in)
  deadMansSwitch: DeadMansSwitchConfig; // Watchdog forwarding to an external heartbeat (opt-in)
  cnpgBackups: CnpgBackupsConfig; // CloudNativePG barman backup and WAL archiving alerts (opt-in)
  alertRouting: AlertRoutingConfig; // Alertmanager notification pacing
  externalUrls: ExternalUrlsConfig; // browser-facing URLs used in notification links
  priorityClasses: PriorityClassesConfig; // scheduling priority by pod role
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
