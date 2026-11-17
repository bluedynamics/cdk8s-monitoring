---
myst:
  html_meta:
    "description": "Send critical alerts to a push channel such as an ntfy topic in addition to mail, so they reach someone at night."
    "property=og:description": "Send critical alerts to a push channel such as an ntfy topic in addition to mail, so they reach someone at night."
    "property=og:title": "Push critical alerts"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, critical, push, ntfy, webhook"
---

# Push critical alerts

This guide shows you how to send alerts with `severity: critical` to a webhook in addition to mail, for example to an ntfy topic that pushes to a phone.
Mail alone arrives late and drowns in the inbox.

The push channel is opt-in.
With the default configuration, critical alerts go to the `email` receiver like every other alert.

## Prerequisites

- A webhook that accepts the Alertmanager JSON payload and a bearer token.
  For ntfy, use a topic URL with a template that turns the payload into a readable message, for example `https://ntfy.example.com/critical?template=alertmanager`.
- A token that may only publish to that topic.
- A Secret in the monitoring namespace with the token under one key.

## Enable the push channel

Set `alertRouting.criticalPush.enabled` to `true`, give the webhook URL, and name the Secret and its key in the `mergeConfig` input.

```typescript
const config = mergeConfig({
  // other required cluster values
  alertRouting: {
    criticalPush: {
      enabled: true,
      url: 'https://ntfy.example.com/critical?template=alertmanager',
      tokenSecret: { name: 'alertmanager-ntfy', key: 'token' },
    },
  },
});
```

`mergeConfig` refuses an enabled block without a URL or without both a Secret name and a key.
A still-firing critical group is sent again every `4h`; set `criticalPush.repeatInterval` to change that.

Create the Secret before you deploy the change.
Prometheus Operator mounts it into the Alertmanager pods, and a missing Secret keeps them from starting.

Critical alerts from namespaces in `stagingAlerts.namespaces` still go to the `staging` receiver and never push.
When mail delivery fails completely, Alertmanager raises the critical `AlertmanagerClusterFailedToSendAlerts`, which reaches you through the push channel.

## Verify the push channel

Post a critical test alert to Alertmanager:

```shell
kubectl port-forward -n monitoring svc/kube-prometheus-stack-alertmanager 9093:9093
curl -sS -XPOST http://localhost:9093/api/v2/alerts -H 'Content-Type: application/json' -d '[{
  "labels": {"alertname": "PushTest", "severity": "critical", "namespace": "monitoring"},
  "annotations": {"summary": "Test of the critical push channel"}
}]'
```

After the group wait of 30 seconds, the push and a mail arrive.
The alert resolves by itself after Alertmanager's `resolve_timeout` of 5 minutes, and a resolved notification follows on both channels.

## See also

- {doc}`../reference/configuration-options` — the complete `alertRouting` option list.
- {doc}`../reference/alerts-and-routing` — where the `critical` route sits among the other routes.
