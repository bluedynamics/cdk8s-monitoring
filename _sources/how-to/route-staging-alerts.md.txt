---
myst:
  html_meta:
    "description": "Route alerts from staging namespaces to a demoted email receiver with a [STAGING] subject prefix by setting stagingAlerts.enabled and stagingAlerts.namespaces."
    "property=og:description": "Route alerts from staging namespaces to a demoted email receiver with a [STAGING] subject prefix by setting stagingAlerts.enabled and stagingAlerts.namespaces."
    "property=og:title": "Route staging alerts away from production"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, staging, routing, receiver"
---

# Route staging alerts away from production

This guide shows you how to keep alerts from a staging namespace from reading like a production page.
Use it when a staging deployment shares the cluster, and therefore the monitoring stack, with production workloads.

Staging alert routing is opt-in.
With the default configuration, every namespace routes to the single production email receiver.

## Enable the staging route

Set `stagingAlerts.enabled` to `true` and list the staging namespaces in `stagingAlerts.namespaces` in the `mergeConfig` input.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  stagingAlerts: {
    enabled: true,
    namespaces: ['myapp-stage'],
  },
});
```

`mergeConfig` refuses an enabled block without at least one namespace.

## What the route does

Alerts whose `namespace` label matches one of the listed namespaces are routed to a separate `staging` receiver.
The receiver mails the same address as the production receiver, but prefixes the subject with `[STAGING]`, so the mail stays visible and filterable without reading like a production incident.

Noise-drop routes such as `Watchdog` and `CPUThrottlingHigh` keep precedence over the staging route, so suppressed alertnames stay suppressed in staging too.
Alerts without a `namespace` label, such as cluster-level alerts, are unaffected and route to the production receiver.

## Verify the routing

After deployment, confirm the generated Alertmanager configuration contains the staging route.

```shell
kubectl get secret -n monitoring alertmanager-kube-prometheus-stack-alertmanager -o jsonpath='{.data.alertmanager\.yaml}' | base64 -d
```

The `route.routes` list must contain a `match_re` entry for your namespaces pointing at `receiver: staging`, and the `receivers` list must contain the `staging` receiver.

## Next steps

- {doc}`../how-to/add-app-dashboards` — put staging dashboards in their own Grafana folder with the `grafana_folder` annotation.

## See also

- {doc}`../reference/configuration-options` — the complete `stagingAlerts` option list.
- {doc}`configure-smtp-alerting` — the email receiver both routes deliver to.
