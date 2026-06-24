import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';

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
 * - PriorityClass 'high-priority' exists
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
        valuesContent: helmValues,
      },
    });
  }

  private generateHelmValues(config: MonitoringConfig): string {
    return `kubeEtcd:
  enabled: false

# Disable kube-controller-manager and kube-scheduler monitoring. See https://github.com/cablespaghetti/k3s-monitoring/issues/2
kubeControllerManager:
  enabled: false
kubeScheduler:
  enabled: false

# Detect PodDisruptionBudgets that would block a node drain during k3s upgrades.
# Operator-managed PDBs sit at disruptionsAllowed=0 by design (Longhorn instance-managers,
# CNPG *-primary) and are excluded so the alert only fires on anomalous app PDBs.
additionalPrometheusRulesMap:
  pdb-drain-safety:
    groups:
      - name: pdb.rules
        interval: 1m
        rules:
          - alert: PodDisruptionBudgetUndrainable
            expr: kube_poddisruptionbudget_status_pod_disruptions_allowed{namespace!="longhorn-system", poddisruptionbudget!~".*-primary"} == 0
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
            expr: kube_poddisruptionbudget_status_pod_disruptions_allowed{namespace!="longhorn-system", poddisruptionbudget!~".*-primary"} == 0
            for: 1h
            labels:
              severity: critical
              component: cluster-upgrade
            annotations:
              summary: "PDB {{ $labels.namespace }}/{{ $labels.poddisruptionbudget }} undrainable >1h"
              description: |
                PDB {{ $labels.namespace }}/{{ $labels.poddisruptionbudget }} has blocked
                voluntary disruptions for over an hour. A k3s agent upgrade would stall on this node.
  # Detect an EX dedicated worker stuck NotReady — likely a MicroOS reboot hang
  # (pings but sshd/kubelet dead). A hung node also holds the cluster-wide kured
  # lock, blocking all further graceful reboots, so this must be caught fast.
  ex-worker-reboot:
    groups:
      - name: ex-worker.rules
        interval: 1m
        rules:
          - alert: ExWorkerNotReady
            expr: kube_node_status_condition{condition="Ready",status="true",node=~"kup6s-ex-.*"} == 0
            for: 15m
            labels:
              severity: critical
              component: node
            annotations:
              summary: "EX worker {{ $labels.node }} NotReady for >15m"
              description: |
                EX dedicated worker {{ $labels.node }} has been NotReady for over 15 minutes.
                Possible MicroOS reboot hang (pings but sshd/kubelet/longhorn-manager dead) — the
                node may still hold the cluster-wide kured lock, blocking all further reboots.
                Recovery: Hetzner Robot hardware reset. Do NOT force-detach Longhorn volumes.
              runbook_url: "https://docs.kup6s.com/how-to/troubleshooting/ex-worker-ping-but-dead.html"

# Drop high-cardinality API server and etcd histogram buckets to reduce memory usage
# These metrics alone account for ~200k series (47% of total cardinality)
# We keep _sum and _count suffixes which are sufficient for rate calculations
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

# Kubelet also exposes apiserver metrics - apply same filters
kubelet:
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

alertmanager:
  config:
    global:
      smtp_from: ${config.smtp.from}
      smtp_smarthost: ${config.smtp.host}:${config.smtp.port}
      smtp_require_tls: ${config.smtp.requireTls}
      smtp_auth_username: ${config.smtp.username || config.smtp.from}
      smtp_auth_password: ${config.smtp.password || ''}
    route:
      group_by: ['job']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 1h
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

    receivers:
    - name: 'null'
    - name: email
      email_configs:
      - send_resolved: true
        to: ${config.smtp.from}

    # Inhibition rules allow to mute a set of alerts given that another alert is firing.
    # We use this to mute any warning-level notifications if the same alert is already critical.
    inhibit_rules:
    - source_match:
        severity: 'critical'
      target_match:
        severity: 'warning'
      # Apply inhibition if the alertname is the same.
      equal: ['alertname', 'namespace']

  alertmanagerSpec:
    replicas: ${config.replicas.alertmanager}
    podAntiAffinity: "soft"
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
    priorityClassName: high-priority

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
    retention: ${config.retention.prometheus}  # Reduced from 7d - Thanos provides long-term storage in S3

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
    priorityClassName: high-priority

    # External labels for multi-cluster identification and Thanos
    externalLabels:
      cluster: kup6s
      replica: "$(POD_NAME)"

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
    datasources:
      enabled: false  # We manually provision datasources (Prometheus→Thanos, Loki)

  ingress:
    enabled: true
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
      - name: Loki
        type: loki
        uid: loki
        access: proxy
        url: http://loki-gateway.${config.namespace}.svc.cluster.local
        jsonData:
          maxLines: 1000

prometheusOperator:
  resources:
    limits:
      cpu: 1
      memory: 512Mi
    requests:
      cpu: 50m
      memory: 128Mi
  priorityClassName: high-priority

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
  priorityClassName: high-priority

kube-state-metrics:
  resources:
    limits:
      cpu: 1
      memory: 512Mi
    requests:
      cpu: 5m
      memory: 128Mi
  priorityClassName: high-priority
`;
  }
}
