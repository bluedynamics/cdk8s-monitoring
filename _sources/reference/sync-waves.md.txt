---
myst:
  html_meta:
    "description": "Reference for the ArgoCD sync-wave annotations cdk8s-monitoring assigns to each resource, from the namespace through Thanos."
    "property=og:description": "Reference for the ArgoCD sync-wave annotations cdk8s-monitoring assigns to each resource, from the namespace through Thanos."
    "property=og:title": "Sync waves"
    "keywords": "cdk8s, Kubernetes, monitoring, ArgoCD, sync waves, ordering"
---

# Sync waves

`MonitoringChart` annotates every resource with an `argocd.argoproj.io/sync-wave` value.
ArgoCD applies lower waves before higher waves, which gives the stack a deterministic rollout order.
The waves run from `0` to `3`.

## Wave 0: foundation

These resources must exist before anything references them.

| Resource | Construct |
|---|---|
| `Namespace` | `NamespaceConstruct` |
| `PriorityClass` `high-priority` | `PriorityClassConstruct` |

## Wave 1: external dependencies

Buckets and credentials must exist before pods try to read storage or mount secrets.

| Resource | Construct |
|---|---|
| Thanos S3 `Bucket` (Crossplane) | `ThanosS3BucketConstruct` |
| Loki S3 `Bucket` (Crossplane) | `LokiS3BucketConstruct` |
| Thanos S3 `ExternalSecret` | `ThanosS3CredentialsConstruct` |
| Loki S3 `ExternalSecret` | `LokiS3CredentialsConstruct` |
| Grafana admin `ExternalSecret` | `GrafanaPasswordSecret` |

## Wave 2: core services

The core stack starts once its storage and secrets are in place.

| Resource | Construct |
|---|---|
| kube-prometheus-stack `HelmChart` | `PrometheusStackConstruct` |
| Loki `HelmChart` | `LokiConstruct` |

## Wave 3: advanced services

Collection, querying, and long-term storage start after the core services.

| Resource | Construct |
|---|---|
| Alloy `HelmChart` | `AlloyConstruct` |
| Thanos Query `Deployment` and `Service`s | `ThanosQueryConstruct` |
| Thanos Store `StatefulSet` and `Service`s | `ThanosStoreConstruct` |
| Thanos Compactor `StatefulSet` and `Service` | `ThanosCompactorConstruct` |

## Tracing resources

These resources exist only when `config.tempo.enabled` is true.
They occupy the same waves as their non-tracing counterparts: storage and credentials in wave `1`, workloads in wave `3`.

| Resource | Construct | Wave |
|---|---|---|
| Tempo S3 `Bucket` (Crossplane) | `TempoS3BucketConstruct` | 1 |
| Tempo S3 `ExternalSecret` | `TempoS3CredentialsConstruct` | 1 |
| Tempo `HelmChart` | `TempoConstruct` | 3 |
| Alloy traces `HelmChart` | `AlloyTracesConstruct` | 3 |

## Application dashboards and alerts

The library does not place application dashboards or alerts in any wave; it ships none.
Integration charts attach their own dashboard and alert constructs and choose a wave for them.
Wave `3` is a natural fit, since the dashboards are discovered after Grafana is running.
See {doc}`../how-to/add-app-dashboards`.

## See also

- {doc}`../explanation/architecture` — why the components depend on one another.
