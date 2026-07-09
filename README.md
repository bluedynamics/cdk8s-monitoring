# @bluedynamics/cdk8s-monitoring

A generic [cdk8s](https://cdk8s.io/) construct library for a complete Kubernetes monitoring stack: Prometheus, Thanos, Loki, Grafana, and Alloy, with Thanos long-term storage on S3-compatible object storage.

The library is **application-agnostic**. It synthesizes the stack itself; your own dashboards and alert rules live in your integration chart and attach beside the stack (the Grafana sidecar discovers `ConfigMap`s labeled `grafana_dashboard: "1"`).

## Features

- Prometheus + Alertmanager + Grafana via the kube-prometheus-stack Helm chart.
- Thanos Query, Store, and Compactor for long-term metrics with downsampling.
- Loki + Alloy for log aggregation and collection.
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

### Required vs. defaulted configuration

- **Required (`RequiredClusterConfig`)**: `namespace`, `domains`, `s3`, `smtp`, `integrations`. No universal default exists, so you must provide them. `integrations` names the external Crossplane ProviderConfig and ESO ClusterSecretStores/keys this stack references (nothing is hardcoded — wire your own).
- **Defaulted (`DefaultableConfig`)**: `versions`, `retention`, `storage`, `replicas`, `resources`. Shipped in `DEFAULT_CONFIG`; override any subset via `mergeConfig` (deep-merged).

### Adding application dashboards and alerts

The library does not ship app-specific dashboards. Attach your own construct beside the chart:

```typescript
const chart = new MonitoringChart(app, 'monitoring', config);
new MyAppDashboardConstruct(chart, 'my-app-dashboard', { namespace: config.namespace });
```

A dashboard construct is a `ConfigMap` (use the re-exported `KubeConfigMap`) labeled `grafana_dashboard: "1"` so the Grafana sidecar discovers it. Alert rules are plain `PrometheusRule` resources you manage in your integration repo.

### Generic infrastructure monitors (opt-in)

Monitors for infrastructure components that are generic across clusters running this stack are built in but **disabled by default** — enable them per cluster. They are the exception to the "no dashboards/alerts in the library" rule because they are not app- or cluster-specific.

```typescript
new MonitoringChart(app, 'monitoring', mergeConfig({
  // ...required config...
  traefik: { enabled: true, namespace: 'traefik' }, // PodMonitor + Grafana dashboard
  longhorn: { enabled: true },                       // ServiceMonitor + volume-health alerts
}));
```

- **`traefik`** (`TraefikConfig`): a `PodMonitor` (the k3s-bundled Traefik exposes the metrics port on the Pod, not the Service) plus, unless `dashboard: false`, a Grafana dashboard `ConfigMap`. `namespace` is where Traefik runs (default `traefik`).
- **`longhorn`** (`LonghornConfig`): a `ServiceMonitor` for `longhorn-manager` (port `manager`) plus, unless `alerts: false`, a `PrometheusRule` with `LonghornVolumeFaulted` (critical) / `LonghornVolumeUnhealthy` (warning). `namespace` defaults to `longhorn-system`.

Both stay inert unless `enabled: true`, so the base stack and existing consumers are unaffected.

## Prerequisites

The stack expects these to exist in the cluster:

- External Secrets Operator (for S3 credentials and the Grafana admin secret).
- Crossplane with an S3 provider config (for bucket provisioning).
- The prometheus-operator CRDs, applied server-side (they are not Helm-managed).

## Development

This project is managed with [projen](https://projen.io/). Do not edit generated files directly.

```shell
npx projen          # regenerate project files after editing .projenrc.ts
npx projen build    # compile + test + lint + package
npx projen test     # run tests
```

## License

Apache-2.0
