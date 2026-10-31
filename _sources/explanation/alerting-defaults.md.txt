---
myst:
  html_meta:
    "description": "Why cdk8s-monitoring drops some stock alerts, replaces others, and paces notifications the way it does."
    "property=og:description": "Why cdk8s-monitoring drops some stock alerts, replaces others, and paces notifications the way it does."
    "property=og:title": "Alerting defaults"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, alert fatigue, CronJob, PodDisruptionBudget"
---

# Alerting defaults

This page explains why the stack's alerting looks the way it does out of the box.
The exact rules and routes are listed in {doc}`../reference/alerts-and-routing`.

## An alert channel lives on trust

An alert mail is only useful as long as somebody reads it.
Every alert that fires without a reason, repeats without news, or arrives twice teaches the reader to skim.
After a few weeks of that, the channel gets a mail filter, and the one alert that matters lands in the same folder as the noise.

The kube-prometheus-stack chart ships a broad rule set that is a good starting point but was written for many kinds of cluster.
Left as is, a small cluster mails a steady stream of alerts that nobody can act on.
The library therefore shapes the defaults before the first mail goes out, rather than leaving every consumer to discover the same noise.

## Alerts that nobody can act on

Some stock alerts go to the `null` receiver.

`Watchdog` fires all the time by design.
It exists to prove that the alerting pipeline works, which only an external dead man's switch can use.
`InfoInhibitor` exists only to suppress `info` alerts and was never meant for a human.

`CPUThrottlingHigh`, `KubeMemoryOvercommit`, `KubeCPUOvercommit`, and `KubeletTooManyPods` describe capacity planning, not incidents.
They fire for weeks on a cluster that runs fine and stay in Grafana for anyone who looks.

## One alert, one mail

Prometheus runs as two replicas, and both evaluate every rule.
Each replica carries its own `replica` external label so that Thanos can deduplicate their metrics.
On alerts, that label made the two copies of the same alert look different, and Alertmanager sent both.
The stack drops `replica` from alerts but keeps it on metrics, so deduplication in Thanos still works.

For the same reason, a `critical` alert suppresses the `warning` alert of the same name in the same namespace.
The reader gets the more severe signal, not both.

## Failed jobs that are no longer failing

The stock `KubeJobFailed` rule fires for as long as a failed `Job` object exists.
A `CronJob` keeps its failed jobs as history until newer failures replace them.
One bad night therefore keeps the alert firing for weeks after the next run succeeded.

The replacement asks the question an operator actually cares about: did the last run of this `CronJob` succeed?
`KubeCronJobLastRunFailed` compares the last schedule time with the last successful time and waits until no run is active, so a job waiting out its retry backoff does not fire early.
It resolves with the next good run.
Jobs without a `CronJob` keep the old semantics under the old name, because nothing replaces a failed one-off job except a human.

## Drains that will not finish

A `PodDisruptionBudget` that allows zero disruptions blocks every node drain that touches its pods.
On a cluster with automatic node upgrades, that turns into an upgrade that hangs for hours without a visible error.
The `pdb-drain-safety` rules make this visible before the next maintenance window instead of during it.

They skip budgets that are zero by design.
Longhorn's instance managers and the primaries of database operators hold their budget at zero on purpose and handle drains themselves.
A budget that selects no pods also reports zero, but it blocks nothing, so it does not fire either.
The warning comes after 15 minutes, the critical variant after one hour, and the critical one suppresses the warning for the same budget.

## Why twelve hours between repeats

Alertmanager repeats a still-firing alert group after its repeat interval.
An interval of one hour, which earlier versions of the library used, turns every long-standing alert into 24 mails a day.
Twelve hours keeps a reminder in the morning and the evening without training anyone to ignore the sender.
New alerts and resolved alerts still go out within minutes, because they do not wait for the repeat interval.

## Links that open

Alert mails carry two links: one to Alertmanager and one to the expression that fired.
By default, both point at in-cluster Service addresses, which is correct from inside the cluster and useless in a mail client.
`externalUrls` exists so that the link in the mail is the first step of the investigation and not a dead end.
For the same reason, Grafana carries an `Alertmanager` datasource, so the active alerts and silences are visible next to the dashboards.

## Where your own alerts fit

The shipped rules cover the cluster itself, which every consumer runs.
Application alerts stay in your integration chart, as described in {doc}`design-philosophy`.
The routing applies to them as well: they reach the same receivers, follow the same repeat interval, and can be demoted per namespace with `stagingAlerts`.

## See also

- {doc}`../reference/alerts-and-routing` — the exact rules, routes, and receivers.
- {doc}`../how-to/tune-alert-notifications` — change links, pacing, and mail headers.
- {doc}`../how-to/route-staging-alerts` — demote alerts from staging namespaces.
