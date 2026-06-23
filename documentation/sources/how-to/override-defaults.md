---
myst:
  html_meta:
    "description": "Override the package defaults for resources, retention, storage, replicas, and versions in cdk8s-monitoring using the deep-merge behavior of mergeConfig."
    "property=og:description": "Override the package defaults for resources, retention, storage, replicas, and versions in cdk8s-monitoring using the deep-merge behavior of mergeConfig."
    "property=og:title": "Override the defaults"
    "keywords": "cdk8s, Kubernetes, monitoring, deep-merge, resources, retention, replicas"
---

# Override the defaults

This guide shows you how to change the package defaults for a single cluster without restating the whole configuration.
The `DefaultableConfig` groups, `versions`, `retention`, `storage`, `replicas`, and `resources`, all ship with values in `DEFAULT_CONFIG`.
`mergeConfig` deep-merges your input over them, so you set only the keys you want to change.

## How the deep-merge works

`mergeConfig` accepts a `MonitoringConfigInput`, which is the required cluster values plus a `DeepPartial` of the defaultable groups.
For each defaultable group, it merges your partial over the default at every nesting level.
Keys you omit keep their default value.

This means a single nested key is enough.
You do not need to repeat the surrounding object.

## Override resources for one component

Raise the Prometheus memory limit and leave every other resource at its default.

```typescript
const config = mergeConfig({
  namespace: 'monitoring',
  domains: { grafana: 'grafana.ops.example.net' },
  s3: { /* ... */ },
  smtp: { /* ... */ },
  resources: {
    prometheus: {
      limits: { memory: '6000Mi' },
    },
  },
});
```

Only `resources.prometheus.limits.memory` changes.
The Prometheus CPU limit, its requests, and every other component keep their defaults.

## Override retention

Keep raw metrics longer and shorten log retention.

```typescript
const config = mergeConfig({
  // required cluster values ...
  retention: {
    prometheusS3Raw: 60,
    loki: '336h',
  },
});
```

## Override storage and replicas

Grow the Prometheus volume and run a single Alertmanager for a small cluster.

```typescript
const config = mergeConfig({
  // required cluster values ...
  storage: { prometheus: '30Gi' },
  replicas: { alertmanager: 1 },
});
```

## Pin a chart version

The `versions` group accepts either a pinned version or the string `latest`.
Pin a chart to a known-good release.

```typescript
const config = mergeConfig({
  // required cluster values ...
  versions: { loki: '7.0.0' },
});
```

When a version is `latest`, the construct omits the version field and lets the Helm controller resolve the newest chart.

```{important}
Pin chart and image versions for any cluster you care about reproducing.
Leaving a version at `latest` makes the synthesized output depend on when the Helm controller runs.
```

## Next steps

- {doc}`../reference/configuration-options` — the complete list of fields and defaults.

## See also

- {doc}`../explanation/retention-and-downsampling` — how the retention values relate.
