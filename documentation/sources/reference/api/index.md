---
myst:
  html_meta:
    "description": "Reference overview of the public API of cdk8s-monitoring: the MonitoringChart orchestrator, the configuration helpers, and the twelve stack constructs."
    "property=og:description": "Reference overview of the public API of cdk8s-monitoring: the MonitoringChart orchestrator, the configuration helpers, and the twelve stack constructs."
    "property=og:title": "API reference"
    "keywords": "cdk8s, Kubernetes, monitoring, API, constructs, MonitoringChart"
---

# API reference

This page describes the public API exported from `@bluedynamics/cdk8s-monitoring`.
The package is TypeScript-only and ships no generated API document; this curated reference is authoritative.

## Orchestrator

`MonitoringChart`
:   The top-level `Chart` that synthesizes the whole stack.
    Construct it with a resolved `MonitoringConfig`.
    Signature: `new MonitoringChart(scope, id, config, props?)`.
    It instantiates every stack construct below in sync-wave order; see {doc}`../sync-waves`.

## Configuration helpers

`mergeConfig(input)`
:   Resolves a full `MonitoringConfig` by deep-merging the caller's overrides over `DEFAULT_CONFIG`.
    Accepts a `MonitoringConfigInput` and returns a `MonitoringConfig`.

`DEFAULT_CONFIG`
:   The package-shipped `DefaultableConfig` for versions, retention, storage, replicas, and resources.
    See {doc}`../configuration-options` for every value.

## Configuration interfaces

`MonitoringConfig`
:   The fully resolved configuration consumed by `MonitoringChart`.

`MonitoringConfigInput`
:   The input to `mergeConfig`: `RequiredClusterConfig` plus a `DeepPartial` of `DefaultableConfig`.

`RequiredClusterConfig`
:   The fields with no default: `namespace`, `domains`, `s3`, `smtp`, `integrations`.

`IntegrationsConfig`
:   The names of external Crossplane and External Secrets Operator resources the stack references but does not create.
    Fields: `s3ProviderConfig`, `s3SecretStore`, `s3CredentialsKey`, `grafanaSecretStore`, `grafanaCredentialsKey`.
    All are required strings; see {doc}`../configuration-options` for each one.

`DefaultableConfig`
:   The fields with defaults: `versions`, `retention`, `storage`, `replicas`, `resources`.

`DeepPartial<T>`
:   A recursive partial type used to type selective overrides.

The sub-interfaces `VersionConfig`, `RetentionConfig`, `StorageConfig`, `ReplicaConfig`, `ResourceConfig`, `S3Config`, `SmtpConfig`, `DomainConfig`, `ResourceRequirements`, and `ResourceAllocation` are documented field by field in {doc}`../configuration-options`.

## Stack constructs

`MonitoringChart` creates each of these, and the package exports them individually so an integration chart can compose them directly when needed.

`NamespaceConstruct`
:   Creates the monitoring namespace. Wave 0.

`PriorityClassConstruct`
:   Creates the `high-priority` `PriorityClass`. Wave 0.

`ThanosS3BucketConstruct`
:   Creates the Crossplane `Bucket` for Thanos metrics. Wave 1.

`LokiS3BucketConstruct`
:   Creates the Crossplane `Bucket` for Loki logs. Wave 1.

`ThanosS3CredentialsConstruct`
:   Creates the `ExternalSecret` that renders the Thanos `objstore.yml`. Wave 1.

`LokiS3CredentialsConstruct`
:   Creates the `ExternalSecret` that renders the Loki S3 credentials. Wave 1.

`GrafanaPasswordSecret`
:   Creates the `ExternalSecret` for the stable Grafana admin password. Wave 1.

`PrometheusStackConstruct`
:   Creates the kube-prometheus-stack `HelmChart` (Prometheus, Grafana, Alertmanager). Wave 2.

`LokiConstruct`
:   Creates the Loki `HelmChart` in SimpleScalable mode. Wave 2.

`AlloyConstruct`
:   Creates the Alloy `HelmChart` DaemonSet for log collection. Wave 3.

`ThanosQueryConstruct`
:   Creates the Thanos Query `Deployment` and `Service`s. Wave 3.

`ThanosStoreConstruct`
:   Creates the Thanos Store Gateway `StatefulSet` and `Service`s. Wave 3.

`ThanosCompactorConstruct`
:   Creates the Thanos Compactor `StatefulSet` and `Service`. Wave 3.

## Re-exported helper

`KubeConfigMap`
:   Re-exported from the generated Kubernetes imports.
    Integration charts use it to build Grafana dashboard `ConfigMap`s without depending on the generated imports directly.
    See {doc}`../../how-to/add-app-dashboards`.

## See also

- {doc}`../configuration-options` — every configuration field and default.
- {doc}`../sync-waves` — the order in which the constructs are applied.
