import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';
import { HELM_CHART_FAILURE_POLICY } from './helm-chart';

export interface PrometheusStackProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates kube-prometheus-stack HelmChart with Prometheus, Grafana, and Alertmanager.
 *
 * This is the core monitoring stack that includes:
 * - Prometheus (metrics collection, 2 replicas, 3d retention)
 * - Grafana (visualization, ingress with Let's Encrypt)
 * - Alertmanager (alert routing, SMTP notifications)
 * - Prometheus Operator (manages Prometheus CRDs)
 * - Node Exporter (system metrics DaemonSet)
 * - kube-state-metrics (Kubernetes resource metrics)
 *
 * Prerequisites:
 * - Namespace exists
 * - The PriorityClasses named in config.priorityClasses exist
 * - Longhorn storage class available
 * - cert-manager ClusterIssuer configured
 * - Thanos S3 secret exists (thanos-objstore-config)
 *
 * Sync Wave: 2 (core services - after S3 buckets and secrets)
 */
export class PrometheusStackConstruct extends Construct {
  constructor(scope: Construct, id: string, props: PrometheusStackProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Generate Helm values YAML
    const helmValues = this.generateHelmValues(config);

    // Create HelmChart resource (K3S Helm controller)
    // Wave 2: Core Services - monitoring stack
    new ApiObject(this, 'kube-prometheus-stack', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: 'kube-prometheus-stack',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'kube-prometheus-stack',
          'app.kubernetes.io/component': 'monitoring',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '2',
        },
      },
      spec: {
        repo: 'https://prometheus-community.github.io/helm-charts',
        chart: 'kube-prometheus-stack',
        version: config.versions.prometheusStack === 'latest' ? undefined : config.versions.prometheusStack,
        targetNamespace: namespace,
        failurePolicy: HELM_CHART_FAILURE_POLICY,
        valuesContent: helmValues,
      },
    });
  }

  /**
   * `[security]` section of grafana.ini, empty unless embedding is enabled.
   *
   * Grafana sends `X-Frame-Options: deny` unless `allow_embedding` is set, which
   * blocks externally shared ("public") dashboards in an iframe just as much as
   * the authenticated UI. Dropping that header alone would let any site frame
   * Grafana, so it is paired with a Content-Security-Policy whose
   * `frame-ancestors` names the allowed origins — browsers honour it in place of
   * the removed header.
   *
   * The other directives are Grafana's own default template verbatim; `$NONCE`
   * and `$ROOT_PATH` are expanded by Grafana per request. Only
   * `$FORM_ACTION_ADDITIONAL_HOSTS` is dropped: it exists as a placeholder just
   * in recent Grafanas, and older ones would emit it literally into the header.
   *
   * The policy is wrapped in `"""`, exactly as Grafana's own defaults.ini does.
   * grafana.ini is parsed by go-ini, which treats `;` as an inline comment — an
   * unquoted policy is silently truncated at its first directive separator, and
   * the browser then receives a CSP without `frame-ancestors` while
   * `X-Frame-Options` is already gone. A YAML block scalar carries the quotes
   * through untouched; a plain quoted scalar would fight over the same
   * character.
   */
  /**
   * Extra Alertmanager route demoting staging-namespace alerts, empty unless
   * stagingAlerts is enabled. Placed after the noise-drop routes (those apply
   * to staging just as much) and before the default production receiver.
   */
  private generateStagingRoute(config: MonitoringConfig): string {
    if (!config.stagingAlerts.enabled) return '';
    return `
      - match_re:
          namespace: ^(${config.stagingAlerts.namespaces.join('|')})$
        receiver: staging`;
  }

  /**
   * The `staging` email receiver, empty unless stagingAlerts is enabled. Same
   * mailbox as the production receiver, but the subject prefix marks the mail
   * as non-production and keeps it filterable.
   */
  /**
   * Alertmanager reads the password from the file when a secret is configured,
   * which keeps it out of the synthesized manifests.
   */
  private generateSmtpAuthPassword(config: MonitoringConfig): string {
    const secret = config.smtp.passwordSecret;
    if (secret) {
      return `smtp_auth_password_file: /etc/alertmanager/secrets/${secret.name}/${secret.key}`;
    }
    return `smtp_auth_password: ${config.smtp.password || ''}`;
  }

  /**
   * The operator only sets the routing prefix from routePrefix (default "/"), so an
   * external URL changes the links in notifications, not the paths the pods serve.
   */
  private generateExternalUrl(url: string): string {
    return url ? `\n    externalUrl: ${url}` : '';
  }

  /** Falls back to the sender address so existing configs keep their recipient. */
  private generateRecipients(config: MonitoringConfig): string {
    const recipients = config.smtp.recipients;
    if (recipients && recipients.length > 0) return recipients.join(', ');
    return config.smtp.from;
  }

  /** Mounts the password secret at /etc/alertmanager/secrets/<name>/<key>. */
  private generateAlertmanagerSecrets(config: MonitoringConfig): string {
    const secret = config.smtp.passwordSecret;
    if (!secret) return '';
    return `
    secrets:
    - ${secret.name}`;
  }

  private generateStagingReceiver(config: MonitoringConfig): string {
    if (!config.stagingAlerts.enabled) return '';
    return `
    - name: staging
      email_configs:
      - send_resolved: true
        to: ${this.generateRecipients(config)}
        headers:
          subject: '[STAGING] {{ template "email.default.subject" . }}'`;
  }

  private generateGrafanaSecurity(config: MonitoringConfig): string {
    if (!config.embedding.enabled) return '';
    const policy = [
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'strict-dynamic' $NONCE",
      "object-src 'none'",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline' blob:",
      'img-src * data:',
      "base-uri 'self'",
      "connect-src 'self' grafana.com ws://$ROOT_PATH wss://$ROOT_PATH",
      "manifest-src 'self'",
      "media-src 'none'",
      "form-action 'self'",
      `frame-ancestors 'self' ${config.embedding.frameAncestors.join(' ')}`,
    ].map((directive) => `${directive};`).join('');
    return `
    security:
      allow_embedding: true
      content_security_policy: true
      content_security_policy_template: >-
        """${policy}"""`;
  }

  private generateHelmValues(config: MonitoringConfig): string {
    // Tempo datasource is only provisioned when tracing is enabled. When
    // disabled this is empty, so the Grafana block is byte-identical to before.
    const tempoDatasource = config.tempo.enabled ? `
      - name: Tempo
        type: tempo
        uid: tempo
        access: proxy
        url: http://tempo.${config.namespace}.svc.cluster.local:3200
        jsonData:
          timeout: 60
          tracesToLogsV2:
            datasourceUid: loki
            spanStartTimeShift: "-1h"
            spanEndTimeShift: "1h"
            filterByTraceID: true
          tracesToMetrics:
            datasourceUid: thanos` : '';
    return `kubeEtcd:
  enabled: false

# Disable kube-controller-manager and kube-scheduler monitoring. See https://github.com/cablespaghetti/k3s-monitoring/issues/2
kubeControllerManager:
  enabled: false
kubeScheduler:
  enabled: false

# k3s runs kube-proxy inside the agent rather than as a separate component, so
# there is no endpoint to scrape. Leaving this enabled makes the stock
# KubeProxyDown rule -- absent(up{job="kube-proxy"}) -- fire forever on a
# perfectly healthy cluster.
kubeProxy:
  enabled: false

# The stock KubeJobFailed fires for as long as a failed Job object exists. CronJobs
# keep their failed Jobs (failedJobsHistoryLimit) until newer failures replace them,
# so one bad night keeps the alert firing for weeks after the CronJob has recovered.
# The job-health group below replaces it.
defaultRules:
  disabled:
    KubeJobFailed: true

# Detect PodDisruptionBudgets that would block a node drain during k3s upgrades.
# Operator-managed PDBs sit at disruptionsAllowed=0 by design (Longhorn instance-managers,
# CNPG *-primary) and are excluded so the alert only fires on anomalous app PDBs.
# A PDB that selects no pods also reports disruptionsAllowed=0, but blocks nothing.
additionalPrometheusRulesMap:
  job-health:
    groups:
      - name: job.rules
        rules:
          # status.active of a CronJob lists its unfinished Jobs, including one
          # waiting out its retry backoff, so active == 0 means the last run is over.
          - alert: KubeCronJobLastRunFailed
            expr: |
              (
                kube_cronjob_status_last_schedule_time{job="kube-state-metrics"}
                  > on(namespace, cronjob) kube_cronjob_status_last_successful_time{job="kube-state-metrics"}
                or
                kube_cronjob_status_last_schedule_time{job="kube-state-metrics"}
                  unless on(namespace, cronjob) kube_cronjob_status_last_successful_time{job="kube-state-metrics"}
              )
              and on(namespace, cronjob) kube_cronjob_status_active{job="kube-state-metrics"} == 0
            for: 15m
            labels:
              severity: warning
            annotations:
              summary: "CronJob {{ $labels.namespace }}/{{ $labels.cronjob }}: last run failed"
              description: |
                The most recent run of CronJob {{ $labels.namespace }}/{{ $labels.cronjob }} did not
                succeed. The alert resolves with the next successful run.
                Check: kubectl get jobs -n {{ $labels.namespace }} --sort-by=.metadata.creationTimestamp
          - alert: KubeJobFailed
            expr: |
              kube_job_failed{job="kube-state-metrics", condition="true"} > 0
              unless on(namespace, job_name) kube_job_owner{job="kube-state-metrics", owner_kind="CronJob"}
            for: 15m
            labels:
              severity: warning
            annotations:
              summary: "Job {{ $labels.namespace }}/{{ $labels.job_name }} failed"
              description: |
                Job {{ $labels.namespace }}/{{ $labels.job_name }} failed. It is not owned by a
                CronJob (those are covered by KubeCronJobLastRunFailed), so it stays failed until
                someone fixes and re-runs or deletes it.
  pdb-drain-safety:
    groups:
      - name: pdb.rules
        interval: 1m
        rules:
          - alert: PodDisruptionBudgetUndrainable
            expr: |
              kube_poddisruptionbudget_status_pod_disruptions_allowed{namespace!="longhorn-system", poddisruptionbudget!~".*-primary"} == 0
              and on(namespace, poddisruptionbudget) kube_poddisruptionbudget_status_expected_pods > 0
            for: 15m
            labels:
              severity: warning
              component: cluster-upgrade
            annotations:
              summary: "PDB {{ $labels.namespace }}/{{ $labels.poddisruptionbudget }} allows 0 voluntary disruptions"
              description: |
                The PodDisruptionBudget {{ $labels.namespace }}/{{ $labels.poddisruptionbudget }}
                has allowed 0 voluntary disruptions for over 15 minutes. This will block a node
                drain during k3s upgrades. Operator-managed PDBs (Longhorn, CNPG primaries) are
                excluded from this alert. Likely a degraded deployment (0 healthy pods) or a
                single-replica deployment with minAvailable=1.
                Check: kubectl get pdb -n {{ $labels.namespace }} {{ $labels.poddisruptionbudget }}
          - alert: PodDisruptionBudgetUndrainableCritical
            expr: |
              kube_poddisruptionbudget_status_pod_disruptions_allowed{namespace!="longhorn-system", poddisruptionbudget!~".*-primary"} == 0
              and on(namespace, poddisruptionbudget) kube_poddisruptionbudget_status_expected_pods > 0
            for: 1h
            labels:
              severity: critical
              component: cluster-upgrade
            annotations:
              summary: "PDB {{ $labels.namespace }}/{{ $labels.poddisruptionbudget }} undrainable >1h"
              description: |
                PDB {{ $labels.namespace }}/{{ $labels.poddisruptionbudget }} has blocked
                voluntary disruptions for over an hour. A k3s agent upgrade would stall on this node.
# Drop high-cardinality API server and etcd histogram buckets to reduce memory usage
# These metrics alone account for ~200k series (47% of total cardinality)
# We keep _sum and _count suffixes which are sufficient for rate calculations
#
# The watch histograms, the workqueue and the scheduler plugin buckets came on
# top of that: k3s runs apiserver, controller-manager and scheduler in one
# process with one metrics registry, so the apiserver endpoint also serves
# scheduler_* and workqueue_* series. Measured on a 6-node k3s cluster
# (2026-10-24): 56k watch_*, 8k workqueue_*, 3k scheduler_plugin_* of 408k
# series. Nothing in the shipped alerts or dashboards reads them.
kubeApiServer:
  serviceMonitor:
    metricRelabelings:
      - sourceLabels: [__name__]
        regex: 'apiserver_request_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_request_sli_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_request_body_size_bytes_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_response_sizes_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'etcd_request_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_watch_(cache_read_wait_seconds|list_duration_seconds|events_sizes)_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'workqueue_(queue|work)_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'scheduler_plugin_execution_duration_seconds_bucket'
        action: drop

# Kubelet also exposes apiserver metrics - apply same filters
kubelet:
  serviceMonitor:
    # /metrics/probes only holds prober_probe_duration_seconds histograms
    # (one series per probe, container and bucket, ~5k on a small cluster);
    # nothing consumes them.
    probes: false
    metricRelabelings:
      - sourceLabels: [__name__]
        regex: 'apiserver_request_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_request_sli_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_request_body_size_bytes_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_response_sizes_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'etcd_request_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'apiserver_watch_(cache_read_wait_seconds|list_duration_seconds|events_sizes)_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'workqueue_(queue|work)_duration_seconds_bucket'
        action: drop
      - sourceLabels: [__name__]
        regex: 'scheduler_plugin_execution_duration_seconds_bucket'
        action: drop

alertmanager:
  config:
    global:
      smtp_from: ${config.smtp.from}
      smtp_smarthost: ${config.smtp.host}:${config.smtp.port}
      smtp_require_tls: ${config.smtp.requireTls}
      smtp_auth_username: ${config.smtp.username || config.smtp.from}
      ${this.generateSmtpAuthPassword(config)}
    route:
      group_by: ['job']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: ${config.alertRouting.repeatInterval}
      receiver: email
      routes:
      - match:
          alertname: Watchdog
        receiver: 'null'
      - match:
          alertname: CPUThrottlingHigh
        receiver: 'null'
      - match:
          alertname: KubeMemoryOvercommit
        receiver: 'null'
      - match:
          alertname: KubeCPUOvercommit
        receiver: 'null'
      - match:
          alertname: KubeletTooManyPods
        receiver: 'null'
      # Severity "none": exists only to inhibit info alerts, never meant for a human.
      - match:
          alertname: InfoInhibitor
        receiver: 'null'${this.generateStagingRoute(config)}

    receivers:
    - name: 'null'
    - name: email
      email_configs:
      - send_resolved: true
        to: ${this.generateRecipients(config)}${this.generateStagingReceiver(config)}

    # Inhibition rules allow to mute a set of alerts given that another alert is firing.
    # We use this to mute any warning-level notifications if the same alert is already critical.
    inhibit_rules:
    - source_match:
        severity: 'critical'
      target_match:
        severity: 'warning'
      # Apply inhibition if the alertname is the same.
      equal: ['alertname', 'namespace']
    # Same PDB, same condition; the critical variant only adds the longer duration.
    - source_match:
        alertname: PodDisruptionBudgetUndrainableCritical
      target_match:
        alertname: PodDisruptionBudgetUndrainable
      equal: ['namespace', 'poddisruptionbudget']

  alertmanagerSpec:
    replicas: ${config.replicas.alertmanager}
    podAntiAffinity: "soft"${this.generateAlertmanagerSecrets(config)}
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: ${config.storage.alertmanager}
    resources:
      limits:
        cpu: ${config.resources.alertmanager.limits.cpu}
        memory: ${config.resources.alertmanager.limits.memory}
      requests:
        cpu: ${config.resources.alertmanager.requests.cpu}
        memory: ${config.resources.alertmanager.requests.memory}
    priorityClassName: ${config.priorityClasses.capture}${this.generateExternalUrl(config.externalUrls.alertmanager)}

    # Sidecar containers resource requests (added 2025-11-18)
    containers:
    - name: config-reloader
      resources:
        requests:
          cpu: ${config.resources.configReloader.requests.cpu}
          memory: ${config.resources.configReloader.requests.memory}
        limits:
          cpu: ${config.resources.configReloader.limits.cpu}
          memory: ${config.resources.configReloader.limits.memory}


prometheus:
  # Enable Thanos service for gRPC communication
  # Required for Helm chart to properly render Thanos sidecar configuration
  thanosService:
    enabled: true

  prometheusSpec:
    retention: ${config.retention.prometheus}  # Reduced from 7d - Thanos provides long-term storage in S3${this.generateExternalUrl(config.externalUrls.prometheus)}

    # Discover ALL ServiceMonitors, PodMonitors and PrometheusRules in ALL namespaces
    # Setting NilUsesHelmValues: false means nil selectors = "select all"
    # Empty namespace selectors {} mean "search all namespaces"
    # Without the rule* settings, ruleSelector keeps the chart default
    # (matchLabels: {release: <name>}) and hand-authored PrometheusRules that
    # lack the release label are silently ignored.
    # Note: This does NOT affect Thanos sidecar - controlled by thanos.objectStorageConfig
    serviceMonitorSelectorNilUsesHelmValues: false
    podMonitorSelectorNilUsesHelmValues: false
    ruleSelectorNilUsesHelmValues: false
    serviceMonitorNamespaceSelector: {}
    podMonitorNamespaceSelector: {}
    ruleNamespaceSelector: {}

    replicas: ${config.replicas.prometheus}
    podAntiAffinity: "hard"
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: longhorn
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: ${config.storage.prometheus}  # Reduced from 6Gi (3d retention needs less space)

    resources:
      limits:
        cpu: ${config.resources.prometheus.limits.cpu}
        memory: ${config.resources.prometheus.limits.memory}
      requests:
        cpu: ${config.resources.prometheus.requests.cpu}
        memory: ${config.resources.prometheus.requests.memory}
    priorityClassName: ${config.priorityClasses.capture}

    # External labels for multi-cluster identification and Thanos
    externalLabels:
      cluster: ${config.clusterName}
      replica: "$(POD_NAME)"
    # Thanos needs the replica label on metrics, but on alerts it makes the two
    # Prometheus replicas look like two different alerts, so every mail lists
    # each one twice. The operator drops its own prometheus_replica the same way.
    additionalAlertRelabelConfigs:
      - action: labeldrop
        regex: replica

    # Thanos sidecar for long-term metrics storage in S3
    # NOTE: chart >=85.x requires the existingSecret shape. The legacy flat
    # {name, key} form is silently dropped by the chart, which removes the
    # sidecar and stops all S3 block uploads (regression seen 2026-03-31).
    thanos:
      objectStorageConfig:
        existingSecret:
          name: thanos-objstore-config  # ESO-managed secret
          key: objstore.yml

    # Sidecar containers resource requests (added 2025-11-18)
    # NOTE: thanos-sidecar is NOT listed here - it's automatically injected by Prometheus Operator
    # when thanos.objectStorageConfig is set. Specifying it in containers[] would override
    # the operator's definition and require us to manually specify the image, which breaks
    # when the operator updates the thanos version.
    containers:
    - name: config-reloader
      resources:
        requests:
          cpu: ${config.resources.configReloader.requests.cpu}
          memory: ${config.resources.configReloader.requests.memory}
        limits:
          cpu: ${config.resources.configReloader.limits.cpu}
          memory: ${config.resources.configReloader.limits.memory}

    service:
      sessionAffinity: "ClientIP"


grafana:
  priorityClassName: ${config.priorityClasses.query}

  # Recreate strategy is required because the storage PVC is RWO:
  # a RollingUpdate would surge a second pod that cannot mount the
  # volume (FailedAttachVolume), blocking the rollout indefinitely.
  deploymentStrategy:
    type: Recreate

  # Use existing secret for admin credentials (managed by ESO)
  # This prevents password regeneration on Helm upgrades
  admin:
    existingSecret: "grafana-admin-credentials"
    userKey: "admin-user"
    passwordKey: "admin-password"

  # Grafana runs http on :3000 behind the TLS-terminating ingress. Without an
  # explicit root_url it builds share and public-dashboard links from the internal
  # address (http://<pod>:3000); derive the external URL from the configured domain.
  grafana.ini:
    server:
      domain: ${config.domains.grafana}
      root_url: https://${config.domains.grafana}${this.generateGrafanaSecurity(config)}

  # Disable default Prometheus datasource (we provide our own pointing to Thanos Query)
  defaultDatasourceEnabled: false

  # Sidecar containers for dashboard/datasource provisioning
  sidecar:
    resources:
      requests:
        cpu: 10m
        memory: 256Mi
      limits:
        cpu: 100m
        memory: 512Mi
    dashboards:
      enabled: true
      # Dashboard ConfigMaps may opt into a named Grafana folder via this
      # annotation; ConfigMaps without it keep landing in General.
      folderAnnotation: grafana_folder
      provider:
        foldersFromFilesStructure: true
    datasources:
      enabled: false  # We manually provision datasources (Prometheus→Thanos, Loki)

  ingress:
    enabled: true${config.domains.ingressClassName ? `\n    ingressClassName: ${config.domains.ingressClassName}` : ''}
    hosts:
      - ${config.domains.grafana}
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-cluster-issuer"
      traefik.ingress.kubernetes.io/router.entrypoints: websecure
    tls:
      - secretName: grafana-general-tls
        hosts:
        - ${config.domains.grafana}

  resources:
    limits:
      cpu: ${config.resources.grafana.limits.cpu}
      memory: ${config.resources.grafana.limits.memory}
    requests:
      cpu: ${config.resources.grafana.requests.cpu}
      memory: ${config.resources.grafana.requests.memory}

  readinessProbe:
    httpGet:
      path: /api/health
      port: 3000
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3

  livenessProbe:
    httpGet:
      path: /api/health
      port: 3000
    initialDelaySeconds: 60
    periodSeconds: 10
    timeoutSeconds: 30
    failureThreshold: 10

  persistence:
    enabled: true
    storageClassName: longhorn
    accessModes:
      - ReadWriteOnce
    size: ${config.storage.grafana}

  # Manual datasource provisioning (sidecar disabled)
  # Thanos Query → long-term/historical metrics (S3 via Store + live sidecar), default
  # Prometheus → local, recent/high-res only (kept for low-latency recent queries)
  # Loki for log aggregation
  datasources:
    datasources.yaml:
      apiVersion: 1
      # Delete any pre-existing Loki datasource (e.g. one created with a
      # randomly generated UID before we pinned uid: loki). Without this,
      # Grafana fails provisioning with "data source not found" because
      # the upsert collides with the existing entry.
      deleteDatasources:
      - name: Loki
        orgId: 1
      datasources:
      - name: Thanos
        type: prometheus
        uid: thanos
        access: proxy
        # thanos-query Service: http port 9090 -> container http 10902
        url: http://thanos-query.${config.namespace}.svc.cluster.local:9090
        isDefault: true
        jsonData:
          timeInterval: 30s
      - name: Prometheus
        type: prometheus
        uid: prometheus
        access: proxy
        url: http://kube-prometheus-stack-prometheus.${config.namespace}.svc.cluster.local:9090
        isDefault: false
        jsonData:
          timeInterval: 30s
      # Shows the alerts that Alertmanager holds, including silences, inside Grafana.
      - name: Alertmanager
        type: alertmanager
        uid: alertmanager
        access: proxy
        url: http://kube-prometheus-stack-alertmanager.${config.namespace}.svc.cluster.local:9093
        jsonData:
          implementation: prometheus
          handleGrafanaManagedAlerts: false
      - name: Loki
        type: loki
        uid: loki
        access: proxy
        url: http://loki-gateway.${config.namespace}.svc.cluster.local
        jsonData:
          maxLines: 1000${tempoDatasource}

prometheusOperator:
  resources:
    limits:
      cpu: 1
      memory: 512Mi
    requests:
      cpu: 50m
      memory: 128Mi
  priorityClassName: ${config.priorityClasses.capture}

prometheus-node-exporter:
  # Bind :9100 to the node InternalIP only, not 0.0.0.0. With kubeRBACProxy
  # disabled the sub-chart sets HOST_IP from fieldRef status.hostIP, which is
  # the node's InternalIP (EX: vSwitch 10.6.0.x via --node-ip; cloud: hcloud
  # private IP). node-exporter is hostNetwork, so Prometheus already scrapes
  # that InternalIP endpoint -> scraping is unaffected, only the public-NIC
  # exposure of the unauthenticated metrics on the EX public IPs goes away.
  service:
    listenOnAllInterfaces: false
  resources:
    limits:
      cpu: 50m
      memory: 50Mi
    requests:
      cpu: 5m
      memory: 16Mi
  priorityClassName: ${config.priorityClasses.capture}

kube-state-metrics:
  resources:
    limits:
      cpu: 1
      memory: 512Mi
    requests:
      cpu: 5m
      memory: 128Mi
  priorityClassName: ${config.priorityClasses.capture}
`;
  }
}
