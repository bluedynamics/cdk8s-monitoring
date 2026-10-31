# @bluedynamics/cdk8s-monitoring

[![npm](https://img.shields.io/npm/v/@bluedynamics/cdk8s-monitoring)](https://www.npmjs.com/package/@bluedynamics/cdk8s-monitoring)
[![Documentation](https://img.shields.io/badge/docs-bluedynamics.github.io-blue)](https://bluedynamics.github.io/cdk8s-monitoring/)

A generic [cdk8s](https://cdk8s.io/) construct library for a complete Kubernetes monitoring stack: Prometheus, Thanos, Loki, Grafana, Alloy, and optionally Tempo, with long-term storage on S3-compatible object storage.

**Full documentation: https://bluedynamics.github.io/cdk8s-monitoring/**

The library is **application-agnostic**. It synthesizes the stack itself; your own dashboards and alert rules live in your integration chart and attach beside the stack (the Grafana sidecar discovers `ConfigMap`s labeled `grafana_dashboard: "1"`).

## Features

- Prometheus + Alertmanager + Grafana via the kube-prometheus-stack Helm chart.
- Thanos Query, Store, and Compactor for long-term metrics with downsampling.
- Loki + Alloy for log aggregation and collection.
- Optional Tempo tracing behind a tail-sampling Alloy gateway.
- Email alerting with curated defaults: noise-free routing, CronJob and PodDisruptionBudget health rules, optional staging demotion.
- Optional Traefik and Longhorn monitors, optional Grafana iframe embedding.
- S3 buckets and credentials wired through Crossplane and External Secrets Operator.
- ArgoCD sync-wave ordering baked in.
- Sensible production defaults you override only where needed (deep-merge).

## Install

```shell
npm install @bluedynamics/cdk8s-monitoring
```

Peer dependencies: `cdk8s`, `cdk8s-plus-33`, `constructs`.

## Usage

Provide your cluster-specific values and let `mergeConfig` fill in the defaults:

```typescript
import { App } from 'cdk8s';
import { MonitoringChart, mergeConfig } from '@bluedynamics/cdk8s-monitoring';

const app = new App();

const config = mergeConfig({
  namespace: 'monitoring',
  clusterName: 'example',
  domains: { grafana: 'grafana.example.com' },
  s3: {
    endpoint: 'https://s3.example.com',
    endpointNoProtocol: 's3.example.com',
    region: 'eu',
    buckets: { thanos: 'metrics-thanos', loki: 'logs-loki' },
  },
  smtp: { host: 'mail.example.com', port: 587, from: 'monitoring@example.com', requireTls: true },
  integrations: {
    s3ProviderConfig: 'my-s3-provider',          // Crossplane ProviderConfig (buckets)
    s3SecretStore: 'my-s3-secret-store',         // ESO ClusterSecretStore (S3 credentials)
    s3CredentialsKey: 'my-s3-credentials',       // remote key holding AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
    grafanaSecretStore: 'my-app-secret-store',   // ESO ClusterSecretStore (Grafana admin)
    grafanaCredentialsKey: 'my-grafana-admin',   // remote key holding admin-user / admin-password
  },
  // Override any default, e.g. storage: { prometheus: '30Gi' }
});

new MonitoringChart(app, 'monitoring', config);
app.synth();
```

`mergeConfig` requires `namespace`, `clusterName`, `domains`, `s3`, `smtp`, and `integrations`, and deep-merges everything else over `DEFAULT_CONFIG`.
Attach your own dashboards (`ConfigMap`s labeled `grafana_dashboard: "1"`) and `PrometheusRule`s beside the chart; the library ships no application-specific content.

## Documentation

The full documentation lives at **https://bluedynamics.github.io/cdk8s-monitoring/**.

- [Quick start tutorial](https://bluedynamics.github.io/cdk8s-monitoring/tutorials/01-quick-start.html)
- [Set up prerequisites](https://bluedynamics.github.io/cdk8s-monitoring/how-to/setup-prerequisites.html) — helm-controller, External Secrets Operator, Crossplane, CRDs, storage
- [How-to guides](https://bluedynamics.github.io/cdk8s-monitoring/how-to/index.html) — SMTP alerting, tracing, Grafana embedding, infrastructure monitors, priority classes, app dashboards
- [Configuration reference](https://bluedynamics.github.io/cdk8s-monitoring/reference/configuration-options.html)
- [Alerts and routing](https://bluedynamics.github.io/cdk8s-monitoring/reference/alerts-and-routing.html)
- [Architecture](https://bluedynamics.github.io/cdk8s-monitoring/explanation/architecture.html) and [platform assumptions](https://bluedynamics.github.io/cdk8s-monitoring/explanation/platform-assumptions.html)

## Prerequisites

The stack targets k3s or RKE2 clusters with ArgoCD and expects:

- the k3s/RKE2 helm-controller (`HelmChart` resources of `helm.cattle.io`),
- External Secrets Operator (S3 credentials, Grafana admin secret),
- Crossplane with an S3 provider config (bucket provisioning),
- the prometheus-operator CRDs, applied server-side,
- a `StorageClass` named `longhorn`, or another class set in `storage.className`.

See [Set up prerequisites](https://bluedynamics.github.io/cdk8s-monitoring/how-to/setup-prerequisites.html) for the details.

## Development

This project is managed with [projen](https://projen.io/). Do not edit generated files directly.

```shell
npx projen          # regenerate project files after editing .projenrc.ts
npx projen build    # compile + test + lint + package
npx projen test     # run tests
```

## License

Apache-2.0
