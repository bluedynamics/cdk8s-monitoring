---
myst:
  html_meta:
    "description": "Reference of the alert rules cdk8s-monitoring ships, the stock rules and scrape targets it disables, and the Alertmanager routing tree, receivers, and inhibition rules it generates."
    "property=og:description": "Reference of the alert rules cdk8s-monitoring ships, the stock rules and scrape targets it disables, and the Alertmanager routing tree, receivers, and inhibition rules it generates."
    "property=og:title": "Alerts and routing"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, PrometheusRule, alerts, routing, inhibition"
---

# Alerts and routing

This page lists the alert rules the library ships, the stock rules it changes, and the Alertmanager configuration it generates.
Your own application alerts are not part of the library; see {doc}`../how-to/add-app-dashboards`.

## Stock kube-prometheus-stack rules

The stack keeps the default rule set of the kube-prometheus-stack chart, with these exceptions.

| Change | Effect |
|---|---|
| `defaultRules.disabled.KubeJobFailed: true` | The stock `KubeJobFailed` rule is off. The `job-health` group below replaces it. |
| `defaultRules.disabled.KubeContainerWaiting: true` | The stock `KubeContainerWaiting` rule is off. The `job-health` group below replaces it. |
| `defaultRules.disabled.NodeMemoryMajorPagesFaults: true` | The stock `NodeMemoryMajorPagesFaults` rule is off. The `node-memory` group below replaces it. |
| `kubeProxy.enabled: false` | No kube-proxy scrape target and no stock `KubeProxyDown` alert. |
| `kubeEtcd.enabled: false` | No etcd scrape target and no stock etcd alerts. |
| `kubeControllerManager.enabled: false` | No kube-controller-manager scrape target and no stock `KubeControllerManagerDown` alert. |
| `kubeScheduler.enabled: false` | No kube-scheduler scrape target and no stock `KubeSchedulerDown` alert. |

## Shipped rule groups

The kube-prometheus-stack `HelmChart` carries three additional rule groups through `additionalPrometheusRulesMap`.
They are always present.

### job-health

| Alert | Severity | For | Fires when |
|---|---|---|---|
| `KubeCronJobLastRunFailed` | `warning` | 15m | The last scheduled run of a CronJob is newer than its last successful run, and the CronJob has no active Job. |
| `KubeJobFailed` | `warning` | 15m | A Job that no CronJob owns has the condition `Failed`. |
| `KubeContainerWaiting` | `warning` | 1h | A container waits for a reason other than `CrashLoopBackOff`, and its pod is in phase `Pending` or `Running`. |

`KubeCronJobLastRunFailed` resolves with the next successful run.
`KubeJobFailed` resolves when the Job is deleted or re-run successfully.
`KubeContainerWaiting` ignores pods in phase `Failed` or `Succeeded`.

### node-memory

| Alert | Severity | For | Fires when |
|---|---|---|---|
| `NodeMemoryMajorPagesFaults` | `warning` | 15m | A node has more than 500 major page faults per second over 5 minutes, and its tasks spent more than 1 % of the last 15 minutes waiting for memory (`node_pressure_memory_waiting_seconds_total`). |

The memory pressure condition needs the `pressure` collector of the node exporter, which is on by default on Linux 4.20 and later.

### pdb-drain-safety

The group evaluates every minute.
Both rules select PodDisruptionBudgets that allow zero voluntary disruptions and expect at least one pod.

| Alert | Severity | For | Labels |
|---|---|---|---|
| `PodDisruptionBudgetUndrainable` | `warning` | 15m | `component: cluster-upgrade` |
| `PodDisruptionBudgetUndrainableCritical` | `critical` | 1h | `component: cluster-upgrade` |

Both rules exclude these PodDisruptionBudgets:

- every PodDisruptionBudget in the namespace `longhorn-system`
- every PodDisruptionBudget whose name ends in `-primary`

## Opt-in rule groups

### longhorn.volume-health

The `longhorn-volume-health` `PrometheusRule` exists only when `longhorn.enabled` and `longhorn.alerts` are both true.

| Alert | Severity | For | Expression |
|---|---|---|---|
| `LonghornVolumeFaulted` | `critical` | 1m | `longhorn_volume_robustness{state="faulted"} == 1` |
| `LonghornVolumeUnhealthy` | `warning` | 10m | `longhorn_volume_robustness{state="degraded"} == 1 or (longhorn_volume_robustness{state="unknown"} == 1 and on (volume) longhorn_volume_state{state="attached"} == 1)` |

Longhorn exports `longhorn_volume_robustness` and `longhorn_volume_state` as one series per state, with the label `state`.
The series of the current state has the value `1`, every other series `0`.
The robustness states are `unknown`, `healthy`, `degraded`, and `faulted`.
A detached volume always reports the robustness `unknown`, so `LonghornVolumeUnhealthy` counts `unknown` only while the volume is attached.

### argocd.gitops

The `argocd-gitops` `PrometheusRule` exists only when `argocd.enabled` and `argocd.alerts` are both true.

| Alert | Severity | For | Expression |
|---|---|---|---|
| `ArgoCdAppSyncUnknown` | `warning` | 15m | `argocd_app_info{sync_status="Unknown"}` |
| `ArgoCdMetricsAbsent` | `warning` | 15m | `absent(argocd_app_info)` |

ArgoCD sets the sync status `Unknown` when it cannot compare an application with Git, for example after a `ComparisonError` from expired repository credentials.
The workloads keep running, so no other alert notices that deployments have stopped.
`ArgoCdMetricsAbsent` fires when the scrape itself fails, because `ArgoCdAppSyncUnknown` cannot fire without metrics.

## Alert labels

Prometheus adds the external label `cluster` with the value of `clusterName` to every alert.
Prometheus drops the external label `replica` from alerts through `additionalAlertRelabelConfigs`.
Metrics keep the `replica` label for Thanos deduplication.

## Routing tree

The root route has these settings.

| Setting | Value |
|---|---|
| `group_by` | `['job']` |
| `group_wait` | `30s` |
| `group_interval` | `5m` |
| `repeat_interval` | `alertRouting.repeatInterval`, default `12h` |
| `receiver` | `email` |

Alertmanager evaluates the child routes in this order and stops at the first match.

| Order | Matcher | Receiver |
|---|---|---|
| 1 | `alertname: Watchdog` | `null`, or `deadmansswitch` when `deadMansSwitch.enabled` is true |
| 2 | `alertname: CPUThrottlingHigh` | `null` |
| 3 | `alertname: KubeMemoryOvercommit` | `null` |
| 4 | `alertname: KubeCPUOvercommit` | `null` |
| 5 | `alertname: KubeletTooManyPods` | `null` |
| 6 | `alertname: InfoInhibitor` | `null` |
| 7 | `namespace` matches `^(<stagingAlerts.namespaces>)$` | `staging` |

Route 7 exists only when `stagingAlerts.enabled` is true.
With `deadMansSwitch.enabled`, route 1 also sets `group_wait: 0s`, `group_interval: 1m`, and `repeat_interval` from `deadMansSwitch.repeatInterval`.
Every alert that matches no child route goes to `email`.

## Receivers

`null`
:   Discards the notification.

`email`
:   Sends to every address in `smtp.recipients`, or to `smtp.from` when `smtp.recipients` is unset.
    Sends resolved notifications as well.
    Adds every entry of `smtp.headers` as a mail header.

`staging`
:   Exists only when `stagingAlerts.enabled` is true.
    Sends to the same addresses as `email`, with resolved notifications.
    Sets the subject to `[STAGING]` followed by the default subject, and adds every entry of `smtp.headers`.

`deadmansswitch`
:   Exists only when `deadMansSwitch.enabled` is true.
    Posts the alert to the URL read from `/etc/alertmanager/secrets/<deadMansSwitch.urlSecret.name>/<deadMansSwitch.urlSecret.key>`.
    Sends no resolved notifications.

## SMTP settings

The Alertmanager `global` block takes its values from the `smtp` configuration.

| Alertmanager setting | Source |
|---|---|
| `smtp_from` | `smtp.from` |
| `smtp_smarthost` | `smtp.host` and `smtp.port` |
| `smtp_require_tls` | `smtp.requireTls` |
| `smtp_auth_username` | `smtp.username`, or `smtp.from` when unset |
| `smtp_auth_password_file` | `/etc/alertmanager/secrets/<name>/<key>` from `smtp.passwordSecret` |
| `smtp_auth_password` | `smtp.password`, only when `smtp.passwordSecret` is unset |

## Inhibition rules

| Source | Target | Equal labels |
|---|---|---|
| `severity: critical` | `severity: warning` | `alertname`, `namespace` |
| `alertname: PodDisruptionBudgetUndrainableCritical` | `alertname: PodDisruptionBudgetUndrainable` | `namespace`, `poddisruptionbudget` |

## Notification links

Alertmanager links to its own `externalUrl`, and each alert links to the `externalUrl` of Prometheus.
Both come from `externalUrls`; see {doc}`configuration-options`.

## See also

- {doc}`../explanation/alerting-defaults` — why the defaults look this way.
- {doc}`../how-to/configure-smtp-alerting` — how to set up mail delivery.
- {doc}`../how-to/tune-alert-notifications` — how to change links and pacing.
- {doc}`../how-to/route-staging-alerts` — how to demote staging alerts.
