---
myst:
  html_meta:
    "description": "Complete reference of every MonitoringConfig field in cdk8s-monitoring, its type, and its DEFAULT_CONFIG value where one exists."
    "property=og:description": "Complete reference of every MonitoringConfig field in cdk8s-monitoring, its type, and its DEFAULT_CONFIG value where one exists."
    "property=og:title": "Configuration options"
    "keywords": "cdk8s, Kubernetes, monitoring, configuration, MonitoringConfig, DEFAULT_CONFIG, reference"
---

# Configuration options

This page lists every field of `MonitoringConfig`, its type, and its default where the package ships one.

The configuration has two parts.
`RequiredClusterConfig` fields have no default and you must provide them.
`DefaultableConfig` fields have a value in `DEFAULT_CONFIG` and you override them through `mergeConfig`.

## Configuration types

`MonitoringConfig`
:   The fully resolved configuration consumed by `MonitoringChart`.
    It extends `RequiredClusterConfig` and `DefaultableConfig`.

`MonitoringConfigInput`
:   The input accepted by `mergeConfig`.
    It is `RequiredClusterConfig` plus a `DeepPartial` of `DefaultableConfig`.

`DeepPartial<T>`
:   A recursive partial in which every property, including nested properties, becomes optional.

## Required cluster configuration

These fields belong to `RequiredClusterConfig` and have no default.

### namespace

| Field | Type | Description |
|---|---|---|
| `namespace` | `string` | Kubernetes namespace the stack runs in. |

### clusterName

| Field | Type | Description |
|---|---|---|
| `clusterName` | `string` | Value of the `cluster` external label applied to all metrics and logs. Identifies this cluster when several feed one Grafana or Thanos. |

### domains

| Field | Type | Description |
|---|---|---|
| `domains.grafana` | `string` | Grafana hostname, used for the ingress and the default `root_url`. |
| `domains.ingressClassName` | `string` (optional) | IngressClass for the Grafana ingress. When omitted, the ingress carries no `ingressClassName` and relies on the cluster's default IngressClass. Set it explicitly on clusters whose ingress controller class is not marked as default. |
| `domains.grafanaIngress` | `boolean` (optional) | Create the Grafana ingress. Default `true`. Set `false` when Grafana is reached another way, for example through a VPN proxy in front of its Service. |
| `domains.grafanaRootUrl` | `string` (optional) | Grafana `root_url`, from which it builds links and redirects. Default `https://<domains.grafana>`. |

### s3

| Field | Type | Description |
|---|---|---|
| `s3.endpoint` | `string` | Full S3 endpoint with protocol (used by Loki). |
| `s3.endpointNoProtocol` | `string` | S3 endpoint without protocol (used by Thanos). |
| `s3.region` | `string` | S3 region. |
| `s3.buckets.thanos` | `string` | Bucket name for Thanos metrics. |
| `s3.buckets.loki` | `string` | Bucket name for Loki logs. |

### smtp

| Field | Type | Description |
|---|---|---|
| `smtp.host` | `string` | SMTP server hostname. |
| `smtp.port` | `number` | SMTP server port. |
| `smtp.from` | `string` | From address; also the alert recipient when `smtp.recipients` is unset. |
| `smtp.username` | `string` (optional) | SMTP username; falls back to `smtp.from`. |
| `smtp.password` | `string` (optional) | SMTP password as a literal. Renders into the synthesized manifests in clear text. Prefer `smtp.passwordSecret`. |
| `smtp.passwordSecret` | `object` (optional) | Read the password from a mounted secret instead. Takes precedence over `smtp.password`. |
| `smtp.passwordSecret.name` | `string` | Secret name in the monitoring namespace. |
| `smtp.passwordSecret.key` | `string` | Key within that secret holding the password. |
| `smtp.recipients` | `string[]` (optional) | Alert recipients. Defaults to `[smtp.from]`. |
| `smtp.headers` | `Record<string, string>` (optional) | Extra mail headers on every notification, for example `{"X-Mailjet-TrackClick": "0"}` to keep a relay from rewriting links. |
| `smtp.requireTls` | `boolean` | Require TLS for the SMTP connection. |

### integrations

These fields name external Crossplane and External Secrets Operator resources that the stack references but does not create.
Each must already exist in your cluster.
All are required strings with no default.

| Field | Type | Description |
|---|---|---|
| `integrations.s3ProviderConfig` | `string` | Crossplane `ProviderConfig` name the `Bucket` resources reconcile against. |
| `integrations.s3SecretStore` | `string` | ESO `ClusterSecretStore` name holding the S3 credentials. |
| `integrations.s3CredentialsKey` | `string` | Remote key in that store providing `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. |
| `integrations.grafanaSecretStore` | `string` | ESO `ClusterSecretStore` name holding the Grafana admin credentials. |
| `integrations.grafanaCredentialsKey` | `string` | Remote key in that store providing `admin-user` and `admin-password`. |

## Defaultable configuration

These fields belong to `DefaultableConfig`.
Each one shows the value shipped in `DEFAULT_CONFIG`.

### versions

| Field | Type | Default |
|---|---|---|
| `versions.prometheusStack` | `string` | `87.0.0` |
| `versions.loki` | `string` | `7.0.0` |
| `versions.alloy` | `string` | `1.10.0` |
| `versions.thanos` | `string` | `v0.41.0` |
| `versions.tempo` | `string` | `1.24.4` |

A version of `latest` omits the version field and lets the Helm controller resolve the newest chart.
The Alloy traces gateway uses `versions.alloy`; it has no separate version field.

### retention

| Field | Type | Default |
|---|---|---|
| `retention.prometheus` | `string` | `2d` |
| `retention.prometheusS3Raw` | `number` | `30` |
| `retention.prometheusS35m` | `number` | `180` |
| `retention.prometheusS31h` | `number` | `730` |
| `retention.loki` | `string` | `744h` |

The `prometheusS3Raw`, `prometheusS35m`, and `prometheusS31h` values are Thanos retention windows in days for raw, 5-minute, and 1-hour resolutions.

### storage

| Field | Type | Default |
|---|---|---|
| `storage.prometheus` | `string` | `15Gi` |
| `storage.grafana` | `string` | `5Gi` |
| `storage.alertmanager` | `string` | `1Gi` |
| `storage.lokiBackend` | `string` | `10Gi` |
| `storage.lokiWrite` | `string` | `3Gi` |
| `storage.thanosStore` | `string` | `10Gi` |
| `storage.thanosCompactor` | `string` | `20Gi` |
| `storage.tempo` | `string` | `5Gi` |

The `tempo` value sizes the Tempo write-ahead-log and local-blocks PVC; persisted trace blocks live in S3.

Every PVC except the Alertmanager PVC requests the `StorageClass` named `longhorn`.
The Alertmanager PVC names no class and gets the cluster's default `StorageClass`.
No configuration field changes the class.

### replicas

| Field | Type | Default |
|---|---|---|
| `replicas.prometheus` | `number` | `2` |
| `replicas.alertmanager` | `number` | `2` |
| `replicas.grafana` | `number` | `1` |
| `replicas.lokiBackend` | `number` | `2` |
| `replicas.lokiRead` | `number` | `2` |
| `replicas.lokiWrite` | `number` | `2` |
| `replicas.thanosQuery` | `number` | `2` |
| `replicas.thanosStore` | `number` | `2` |
| `replicas.tempo` | `number` | `1` |

The Alloy traces gateway is fixed at one replica and has no replica field; tail sampling requires a single instance to see every span of a trace.

### resources

Each `resources` entry is a `ResourceRequirements` object with `requests` and `limits`, and each of those is a `ResourceAllocation` with `cpu` and `memory`.

| Component | Requests (cpu / memory) | Limits (cpu / memory) |
|---|---|---|
| `resources.prometheus` | `100m` / `1500Mi` | `2` / `3000Mi` |
| `resources.grafana` | `50m` / `512Mi` | `200m` / `1Gi` |
| `resources.alertmanager` | `25m` / `100Mi` | `100m` / `200Mi` |
| `resources.lokiBackend` | `100m` / `256Mi` | `500m` / `512Mi` |
| `resources.lokiRead` | `100m` / `256Mi` | `500m` / `512Mi` |
| `resources.lokiWrite` | `100m` / `512Mi` | `1` / `1Gi` |
| `resources.lokiGateway` | `50m` / `128Mi` | `200m` / `256Mi` |
| `resources.alloy` | `100m` / `128Mi` | `200m` / `256Mi` |
| `resources.thanosQuery` | `200m` / `512Mi` | `1000m` / `1Gi` |
| `resources.thanosStore` | `200m` / `1Gi` | `1000m` / `2Gi` |
| `resources.thanosCompactor` | `500m` / `2Gi` | `2000m` / `4Gi` |
| `resources.configReloader` | `10m` / `50Mi` | `50m` / `100Mi` |
| `resources.thanosSidecar` | `10m` / `50Mi` | `100m` / `100Mi` |
| `resources.tempo` | `100m` / `256Mi` | `1` / `1Gi` |
| `resources.alloyTraces` | `100m` / `256Mi` | `500m` / `512Mi` |

The `configReloader` entry applies to the config-reloader sidecar of Prometheus, Alertmanager, and Alloy.
The `thanosSidecar` entry applies to the Thanos sidecar attached to Prometheus.
The `tempo` entry applies to the monolithic Tempo workload, and `alloyTraces` to the Alloy traces gateway.

### tempo

The `tempo` block configures the opt-in distributed tracing pillar.
It belongs to `DefaultableConfig`, so it defaults to disabled and you override only what you need.
When `tempo.enabled` is false, no tracing resources are created.

| Field | Type | Default | Description |
|---|---|---|---|
| `tempo.enabled` | `boolean` | `false` | Master switch; when false, no Tempo, gateway, bucket, or datasource is created. |
| `tempo.bucket` | `string` | `''` | S3 bucket for trace blocks. Required when `tempo.enabled` is true. |
| `tempo.retention` | `string` | `336h` | Tempo block retention, enforced by the compactor (`336h` is 14 days). |
| `tempo.tailSampling.latencyThresholdMs` | `number` | `1000` | Keep traces slower than this many milliseconds. |
| `tempo.tailSampling.probabilisticPercent` | `number` | `10` | Keep this percentage of the remaining traces as a representative sample. |

`mergeConfig` throws `tempo.bucket is required when tempo.enabled is true` when you enable tracing without a bucket name.
The gateway always keeps traces that contain an error span, in addition to the slow and probabilistic policies above.

### embedding

The `embedding` block controls whether browsers may load Grafana inside an `<iframe>`.
It belongs to `DefaultableConfig`, so it defaults to disabled.
When `embedding.enabled` is false, `grafana.ini` carries no `[security]` section and Grafana keeps its own default of `X-Frame-Options: deny`.

| Field | Type | Default | Description |
|---|---|---|---|
| `embedding.enabled` | `boolean` | `false` | Master switch; when true, sets `allow_embedding`, `content_security_policy`, and `content_security_policy_template` in `grafana.ini`. |
| `embedding.frameAncestors` | `string[]` | `[]` | Origins allowed to frame Grafana, each an absolute origin such as `https://console.example.com`. They are appended to `frame-ancestors 'self'`. |

`mergeConfig` throws `embedding.frameAncestors must name at least one origin when embedding.enabled is true` when you enable embedding without an origin.

The generated policy repeats Grafana's own default directives and adds `frame-ancestors`.
It omits the `$FORM_ACTION_ADDITIONAL_HOSTS` placeholder from Grafana's stock template, so `form_action_additional_hosts` has no effect while embedding is enabled.

### stagingAlerts

The `stagingAlerts` block controls demoted alert routing for staging namespaces that share the cluster's monitoring stack.
It belongs to `DefaultableConfig`, so it defaults to disabled.
When `stagingAlerts.enabled` is false, the Alertmanager configuration carries no staging route or receiver.

| Field | Type | Default | Description |
|---|---|---|---|
| `stagingAlerts.enabled` | `boolean` | `false` | Master switch; when true, adds a `staging` route and receiver to the Alertmanager configuration. |
| `stagingAlerts.namespaces` | `string[]` | `[]` | Namespaces whose alerts route to the `staging` receiver, matched against the `namespace` label. |

`mergeConfig` throws `stagingAlerts.namespaces must name at least one namespace when stagingAlerts.enabled is true` when you enable the block without a namespace.

The `staging` receiver mails the same address as the production receiver with a `[STAGING]` subject prefix.
The noise-drop routes for alertnames such as `Watchdog` keep precedence over the staging route.

### alertRouting

The `alertRouting` block paces Alertmanager notifications.
It belongs to `DefaultableConfig`.

| Field | Type | Default | Description |
|---|---|---|---|
| `alertRouting.repeatInterval` | `string` | `12h` | Alertmanager `repeat_interval`: how often a still-firing alert group is mailed again. |

The routes, receivers, and inhibition rules around this interval are listed in {doc}`alerts-and-routing`.

### externalUrls

The `externalUrls` block sets the browser-facing addresses that notifications link to.
It belongs to `DefaultableConfig`.

| Field | Type | Default | Description |
|---|---|---|---|
| `externalUrls.alertmanager` | `string` | `''` | Alertmanager `externalUrl`, used for the link to Alertmanager in every notification. |
| `externalUrls.prometheus` | `string` | `''` | Prometheus `externalUrl`, used for each alert's source link (`/graph?g0.expr=…`). A Thanos Query in front of Prometheus understands the same links. |

An empty string keeps the operator default, which is the in-cluster Service address and does not open from a browser.
The setting changes only the links; the pods keep serving under the route prefix `/`.

Grafana carries an `Alertmanager` datasource, so the active alerts and silences are visible in Grafana as well.

### traefik

The `traefik` block adds opt-in monitoring for a Traefik ingress controller.
It belongs to `DefaultableConfig`, so it defaults to disabled.
When `traefik.enabled` is false, no Traefik resources are created.

| Field | Type | Default | Description |
|---|---|---|---|
| `traefik.enabled` | `boolean` | `false` | Master switch; when true, creates the `traefik-metrics` `PodMonitor`. |
| `traefik.namespace` | `string` | `traefik` | Namespace Traefik runs in, used as the `PodMonitor` namespace selector. |
| `traefik.dashboard` | `boolean` | `true` | Ship the Traefik Grafana dashboard as the `traefik-dashboard` `ConfigMap`. |

The `PodMonitor` selects pods labeled `app.kubernetes.io/name: traefik` and scrapes their `metrics` port at `/metrics` every 30 seconds.
`mergeConfig` throws `traefik.namespace is required when traefik.enabled is true` when you enable the block with an empty namespace.

### longhorn

The `longhorn` block adds opt-in monitoring for Longhorn storage.
It belongs to `DefaultableConfig`, so it defaults to disabled.
When `longhorn.enabled` is false, no Longhorn resources are created.

| Field | Type | Default | Description |
|---|---|---|---|
| `longhorn.enabled` | `boolean` | `false` | Master switch; when true, creates the `longhorn-metrics` `ServiceMonitor`. |
| `longhorn.namespace` | `string` | `longhorn-system` | Namespace Longhorn runs in, used as the `ServiceMonitor` namespace selector. |
| `longhorn.alerts` | `boolean` | `true` | Ship the `longhorn-volume-health` `PrometheusRule`. |

The `ServiceMonitor` selects services labeled `app: longhorn-manager` and scrapes their `manager` port.
The alert rules are listed in {doc}`alerts-and-routing`.
`mergeConfig` throws `longhorn.namespace is required when longhorn.enabled is true` when you enable the block with an empty namespace.

### priorityClasses

The `priorityClasses` block sets the `priorityClassName` of every pod in the stack.
It belongs to `DefaultableConfig`.

| Field | Type | Default | Description |
|---|---|---|---|
| `priorityClasses.create` | `boolean` | `true` | Create the `high-priority` `PriorityClass` (value `10000`) in wave `0`. |
| `priorityClasses.capture` | `string` | `high-priority` | Class for pods that ingest data or route alerts. |
| `priorityClasses.query` | `string` | `high-priority` | Class for pods that only serve queries. |

The two roles cover these workloads:

| Role | Workloads |
|---|---|
| `capture` | Prometheus, Alertmanager, Prometheus Operator, node-exporter, kube-state-metrics, Loki write, Loki backend, Loki gateway, Alloy, Tempo, Alloy traces gateway |
| `query` | Grafana, Thanos Query, Thanos Store, Thanos Compactor, Loki read |

When you set `priorityClasses.create` to `false`, the classes named in `capture` and `query` must already exist in the cluster.
Kubernetes rejects pods that name a missing `PriorityClass`.

## See also

- {doc}`../how-to/override-defaults` — how to change these values.
- {doc}`../how-to/embed-grafana` — how to enable and verify embedding.
- {doc}`../how-to/route-staging-alerts` — how to enable and verify staging alert routing.
- {doc}`../how-to/enable-infrastructure-monitors` — how to turn on the Traefik and Longhorn monitors.
- {doc}`../how-to/set-priority-classes` — how to use your cluster's own priority classes.
- {doc}`alerts-and-routing` — the shipped alert rules and the Alertmanager routing tree.
- {doc}`sync-waves` — the rollout order of the resources.
