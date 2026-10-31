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
| `kubeProxy.enabled: false` | No kube-proxy scrape target and no stock `KubeProxyDown` alert. |
| `kubeEtcd.enabled: false` | No etcd scrape target and no stock etcd alerts. |
| `kubeControllerManager.enabled: false` | No kube-controller-manager scrape target and no stock `KubeControllerManagerDown` alert. |
| `kubeScheduler.enabled: false` | No kube-scheduler scrape target and no stock `KubeSchedulerDown` alert. |

## Shipped rule groups

The kube-prometheus-stack `HelmChart` carries two additional rule groups through `additionalPrometheusRulesMap`.
They are always present.

### job-health

| Alert | Severity | For | Fires when |
|---|---|---|---|
| `KubeCronJobLastRunFailed` | `warning` | 15m | The last scheduled run of a CronJob is newer than its last successful run, and the CronJob has no active Job. |
| `KubeJobFailed` | `warning` | 15m | A Job that no CronJob owns has the condition `Failed`. |

`KubeCronJobLastRunFailed` resolves with the next successful run.
`KubeJobFailed` resolves when the Job is deleted or re-run successfully.

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
| `LonghornVolumeFaulted` | `critical` | 1m | `longhorn_volume_robustness == 3` |
| `LonghornVolumeUnhealthy` | `warning` | 10m | `longhorn_volume_robustness == 0 or longhorn_volume_robustness == 2` |

The metric `longhorn_volume_robustness` takes the values `0` (unknown), `1` (healthy), `2` (degraded), and `3` (faulted).

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
| 1 | `alertname: Watchdog` | `null` |
| 2 | `alertname: CPUThrottlingHigh` | `null` |
| 3 | `alertname: KubeMemoryOvercommit` | `null` |
| 4 | `alertname: KubeCPUOvercommit` | `null` |
| 5 | `alertname: KubeletTooManyPods` | `null` |
| 6 | `alertname: InfoInhibitor` | `null` |
| 7 | `namespace` matches `^(<stagingAlerts.namespaces>)$` | `staging` |

Route 7 exists only when `stagingAlerts.enabled` is true.
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
