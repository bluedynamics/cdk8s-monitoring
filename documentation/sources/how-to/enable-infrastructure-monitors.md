---
myst:
  html_meta:
    "description": "Turn on the opt-in Traefik and Longhorn monitors of cdk8s-monitoring and verify that Prometheus scrapes them."
    "property=og:description": "Turn on the opt-in Traefik and Longhorn monitors of cdk8s-monitoring and verify that Prometheus scrapes them."
    "property=og:title": "Enable the infrastructure monitors"
    "keywords": "cdk8s, Kubernetes, monitoring, Traefik, Longhorn, PodMonitor, ServiceMonitor"
---

# Enable the infrastructure monitors

This guide shows you how to turn on the built-in monitors for a Traefik ingress controller and for Longhorn storage.
Both are disabled by default, and you enable each one independently.

## Enable the Traefik monitor

Set `traefik.enabled` in your `mergeConfig` input.
Set `traefik.namespace` if Traefik does not run in the namespace `traefik`.

```typescript
const config = mergeConfig({
  // required cluster values ...
  traefik: {
    enabled: true,
    namespace: 'kube-system',
  },
});
```

The stack then scrapes the `metrics` port of every pod labeled `app.kubernetes.io/name: traefik` in that namespace.
Your Traefik pods must expose a container port named `metrics`.

If you ship your own Traefik dashboard, set `dashboard: false` to skip the built-in one.

## Enable the Longhorn monitor

Set `longhorn.enabled` in your `mergeConfig` input.
Set `longhorn.namespace` if Longhorn does not run in the namespace `longhorn-system`.

```typescript
const config = mergeConfig({
  // required cluster values ...
  longhorn: { enabled: true },
});
```

The stack then scrapes the `manager` port of the `longhorn-manager` service and ships two volume-health alerts.
If you manage Longhorn alerts yourself, set `alerts: false` to keep only the scrape.

## Synthesize and deploy

Synthesize your integration chart and deploy it the way you deploy the rest of the stack.

```shell
npx cdk8s synth
```

## Verify the monitors

Check that the monitor resources exist in the monitoring namespace.

```shell
kubectl get podmonitor,servicemonitor,prometheusrule -n monitoring | grep -E 'traefik|longhorn'
```

Open the {guilabel}`Targets` page of Prometheus, or query Thanos, and confirm that the new targets report `up`.

```shell
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
```

Then open `http://localhost:9090/targets` and look for the target groups `podMonitor/monitoring/traefik-metrics/0` and `serviceMonitor/monitoring/longhorn-metrics/0`.

If you kept the Traefik dashboard, find it in Grafana under the folder {guilabel}`General`.

## See also

- {doc}`../reference/configuration-options` — the `traefik` and `longhorn` fields.
- {doc}`../reference/alerts-and-routing` — the Longhorn volume-health alerts.
- {doc}`add-app-dashboards` — attach monitors for components the library does not cover.
