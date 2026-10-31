---
myst:
  html_meta:
    "description": "Reference of the Grafana datasources cdk8s-monitoring provisions, their UIDs and URLs, and the dashboard sidecar settings."
    "property=og:description": "Reference of the Grafana datasources cdk8s-monitoring provisions, their UIDs and URLs, and the dashboard sidecar settings."
    "property=og:title": "Grafana datasources"
    "keywords": "cdk8s, Kubernetes, monitoring, Grafana, datasource, UID, sidecar, dashboard"
---

# Grafana datasources

This page lists the datasources the stack provisions in Grafana and the settings of the dashboard sidecar.
Dashboards reference a datasource by its UID.

## Provisioned datasources

The stack provisions all datasources through `grafana.datasources` in the kube-prometheus-stack values.
The datasource sidecar is disabled, and so is the chart's default Prometheus datasource.

| Name | Type | UID | URL | Default |
|---|---|---|---|---|
| `Thanos` | `prometheus` | `thanos` | `http://thanos-query.<namespace>.svc.cluster.local:9090` | yes |
| `Prometheus` | `prometheus` | `prometheus` | `http://kube-prometheus-stack-prometheus.<namespace>.svc.cluster.local:9090` | no |
| `Alertmanager` | `alertmanager` | `alertmanager` | `http://kube-prometheus-stack-alertmanager.<namespace>.svc.cluster.local:9093` | no |
| `Loki` | `loki` | `loki` | `http://loki-gateway.<namespace>.svc.cluster.local` | no |
| `Tempo` | `tempo` | `tempo` | `http://tempo.<namespace>.svc.cluster.local:3200` | no |

`<namespace>` is the value of `namespace` in the configuration.
The `Tempo` datasource exists only when `tempo.enabled` is true.

## Datasource settings

`Thanos` and `Prometheus`
:   `timeInterval: 30s`.

`Alertmanager`
:   `implementation: prometheus` and `handleGrafanaManagedAlerts: false`.

`Loki`
:   `maxLines: 1000`.
    The provisioning deletes any existing datasource named `Loki` in organization `1` before it creates the datasource with UID `loki`.

`Tempo`
:   `timeout: 60`.
    `tracesToLogsV2` points at the datasource UID `loki`, filters by trace ID, and shifts the time range by one hour in each direction.
    `tracesToMetrics` points at the datasource UID `thanos`.

## Dashboard sidecar

The Grafana dashboard sidecar loads every `ConfigMap` that carries the label `grafana_dashboard: "1"`.

| Setting | Value |
|---|---|
| `sidecar.dashboards.enabled` | `true` |
| `sidecar.dashboards.folderAnnotation` | `grafana_folder` |
| `sidecar.dashboards.provider.foldersFromFilesStructure` | `true` |

A dashboard `ConfigMap` with the annotation `grafana_folder` lands in the Grafana folder of that name.
A dashboard `ConfigMap` without the annotation lands in the folder `General`.

## Grafana server

| Setting | Value |
|---|---|
| `server.domain` | `domains.grafana` |
| `server.root_url` | `https://` followed by `domains.grafana` |
| Persistence | `storage.grafana` on the `StorageClass` `longhorn`, access mode `ReadWriteOnce` |

## See also

- {doc}`../how-to/add-app-dashboards` — how to ship a dashboard to the sidecar.
- {doc}`../how-to/embed-grafana` — how to allow framing of Grafana.
- {doc}`configuration-options` — every configuration field.
