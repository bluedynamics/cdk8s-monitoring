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

### domains

| Field | Type | Description |
|---|---|---|
| `domains.grafana` | `string` | Hostname for the Grafana ingress. |

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
| `smtp.from` | `string` | From address; also the default alert recipient. |
| `smtp.username` | `string` (optional) | SMTP username; falls back to `smtp.from`. |
| `smtp.password` | `string` (optional) | SMTP password; inject at synth time. |
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

## See also

- {doc}`../how-to/override-defaults` — how to change these values.
- {doc}`sync-waves` — the rollout order of the resources.
