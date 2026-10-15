---
myst:
  html_meta:
    "description": "Build a per-cluster integration chart that consumes cdk8s-monitoring, supplies the required cluster values, and resolves the full configuration with mergeConfig."
    "property=og:description": "Build a per-cluster integration chart that consumes cdk8s-monitoring, supplies the required cluster values, and resolves the full configuration with mergeConfig."
    "property=og:title": "Provide cluster configuration"
    "keywords": "cdk8s, Kubernetes, monitoring, mergeConfig, integration chart, configuration"
---

# Provide cluster configuration

This guide shows you how to build an integration chart that consumes the shared stack and supplies your cluster-specific values.
The library splits configuration into two parts: values you must provide, and values it defaults for you.
You provide the first set and call `mergeConfig` to obtain a complete configuration.

## Required cluster values

Five blocks have no sensible universal default, so the type `RequiredClusterConfig` makes them mandatory.

`namespace`
:   The Kubernetes namespace the stack runs in.

`domains.grafana`
:   The hostname for the Grafana ingress.

`s3`
:   The endpoint, region, and bucket names for Thanos and Loki object storage.

`smtp`
:   The mail server settings Alertmanager uses to send alerts.

`integrations`
:   The names of the external Crossplane and External Secrets Operator resources the stack references.
    The library does not create these; they must already exist in your cluster, and you wire your own names here.

The compiler rejects an integration chart that omits any of these.

## Resolve the configuration

Call `mergeConfig` with your required values.
It returns a complete `MonitoringConfig` with every default filled in.

```typescript
import { App } from 'cdk8s';
import { MonitoringChart, mergeConfig } from '@bluedynamics/cdk8s-monitoring';

const app = new App();

const config = mergeConfig({
  namespace: 'monitoring',
  domains: { grafana: 'grafana.ops.example.net' },
  s3: {
    endpoint: 'https://fsn1.your-objectstorage.com',
    endpointNoProtocol: 'fsn1.your-objectstorage.com',
    region: 'fsn1',
    buckets: { thanos: 'metrics-thanos-prod', loki: 'logs-loki-prod' },
  },
  smtp: {
    host: process.env.SMTP_HOST!,
    port: 587,
    from: 'monitoring@example.net',
    username: 'monitoring@example.net',
    password: process.env.SMTP_PASSWORD,
    requireTls: true,
  },
  integrations: {
    s3ProviderConfig: 'my-s3-provider',
    s3SecretStore: 'my-s3-secret-store',
    s3CredentialsKey: 'my-s3-credentials',
    grafanaSecretStore: 'my-app-secret-store',
    grafanaCredentialsKey: 'my-grafana-admin',
  },
});

new MonitoringChart(app, 'monitoring', config);
app.synth();
```

Pass secrets such as the SMTP password through the environment at synth time rather than committing them.
See {doc}`configure-smtp-alerting` for the alerting details.

## Override a default while you are at it

`mergeConfig` deep-merges your input over the package defaults, so you can override any subset in the same call.

```typescript
const config = mergeConfig({
  namespace: 'monitoring',
  domains: { grafana: 'grafana.ops.example.net' },
  s3: { /* ... */ },
  smtp: { /* ... */ },
  integrations: { /* ... */ },
  storage: { prometheus: '30Gi' },
});
```

Only the keys you set change; everything else keeps its default.
See {doc}`override-defaults` for the full mechanism.

## Synthesize and commit

Synthesize the chart and commit the resulting manifests with your integration repo.

```shell
npx cdk8s synth
```

## Next steps

- {doc}`override-defaults` — tune resources, retention, and replicas.
- {doc}`add-app-dashboards` — attach your own dashboards and alerts.

## See also

- {doc}`../reference/configuration-options` — every field and its default.
- {doc}`../explanation/design-philosophy` — why configuration is split this way.
