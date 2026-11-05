---
myst:
  html_meta:
    "description": "Forward the always-firing Watchdog alert to an external dead man's switch such as Healthchecks, so a dead alerting pipeline raises an alarm somewhere else."
    "property=og:description": "Forward the always-firing Watchdog alert to an external dead man's switch such as Healthchecks, so a dead alerting pipeline raises an alarm somewhere else."
    "property=og:title": "Forward Watchdog to a dead man's switch"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, Watchdog, dead man's switch, heartbeat, Healthchecks"
---

# Forward Watchdog to a dead man's switch

This guide shows you how to post the always-firing `Watchdog` alert to an external heartbeat service.
The service alarms you when the posts stop, which happens when Prometheus, Alertmanager, or the whole cluster is down.

Forwarding is opt-in.
With the default configuration, `Watchdog` goes to the `null` receiver.

## Prerequisites

- A check on a heartbeat service that accepts an HTTP POST on a ping URL, for example a Healthchecks check.
  Set its period to the repeat interval, `5m` by default, and its grace time to at least twice that.
- A Secret in the monitoring namespace with the ping URL under one key.
  The URL is a credential: anyone who knows it can report "alive".

## Enable the forwarding

Set `deadMansSwitch.enabled` to `true` and name the Secret and its key in the `mergeConfig` input.

```typescript
const config = mergeConfig({
  // other required cluster values
  deadMansSwitch: {
    enabled: true,
    urlSecret: { name: 'alertmanager-deadmansswitch', key: 'url' },
  },
});
```

`mergeConfig` refuses an enabled block without both a Secret name and a key.
To ping more or less often, set `deadMansSwitch.repeatInterval`, for example `'2m'`, and adjust the check's period to match.

Create the Secret before you deploy the change.
Prometheus Operator mounts it into the Alertmanager pods, and a missing Secret keeps them from starting.

## Verify the forwarding

Confirm that the generated Alertmanager configuration routes `Watchdog` to the new receiver:

```shell
kubectl get secret -n monitoring alertmanager-kube-prometheus-stack-alertmanager -o jsonpath='{.data.alertmanager\.yaml}' | base64 -d
```

The first entry of `route.routes` must match `alertname: Watchdog` with `receiver: deadmansswitch`, and the `deadmansswitch` receiver must carry a `url_file` under `/etc/alertmanager/secrets/`.
Within one repeat interval, the check on the heartbeat service must turn up.

To test the alarm path, create a silence on `alertname=Watchdog` that lasts longer than the check's period plus grace time.
The posts stop, the heartbeat service alarms, and it reports recovery once you expire the silence.

## See also

- {doc}`../reference/configuration-options` — the complete `deadMansSwitch` option list.
- {doc}`../reference/alerts-and-routing` — where the `Watchdog` route sits among the other routes.
