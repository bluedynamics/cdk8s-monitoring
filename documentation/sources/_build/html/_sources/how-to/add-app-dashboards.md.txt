---
myst:
  html_meta:
    "description": "Attach application-specific Grafana dashboards and Prometheus alert rules beside the cdk8s-monitoring stack using the re-exported KubeConfigMap and the Grafana sidecar discovery label."
    "property=og:description": "Attach application-specific Grafana dashboards and Prometheus alert rules beside the cdk8s-monitoring stack using the re-exported KubeConfigMap and the Grafana sidecar discovery label."
    "property=og:title": "Add application dashboards and alerts"
    "keywords": "cdk8s, Kubernetes, monitoring, Grafana, dashboards, sidecar, PrometheusRule"
---

# Add application dashboards and alerts

This guide shows you how to add your own Grafana dashboards and Prometheus alert rules to a running stack.
The library is application-agnostic: it ships the stack and the Grafana sidecar that discovers dashboards, but no dashboards or alerts of its own.
You attach yours in your integration chart, beside the `MonitoringChart`.

## How discovery works

The kube-prometheus-stack Grafana runs a sidecar that watches the monitoring namespace for `ConfigMap`s labeled `grafana_dashboard: "1"`.
Any matching `ConfigMap` is loaded as a dashboard at runtime.
Alert rules work the same way through the prometheus-operator: a `PrometheusRule` in the namespace is picked up automatically.

This is the entire plug-in mechanism.
You do not register anything with the library; you create the right resources in the right namespace, and the running stack finds them.

## Add a dashboard ConfigMap

Build a dashboard `ConfigMap` with the re-exported `KubeConfigMap`.
The library re-exports it so you can construct dashboards without depending on the generated imports directly.

```typescript
import { Construct } from 'constructs';
import { KubeConfigMap } from '@bluedynamics/cdk8s-monitoring';
import * as fs from 'fs';

export interface AppDashboardProps {
  readonly namespace: string;
}

export class AppDashboardConstruct extends Construct {
  constructor(scope: Construct, id: string, props: AppDashboardProps) {
    super(scope, id);

    new KubeConfigMap(this, 'dashboard', {
      metadata: {
        name: 'my-app-dashboard',
        namespace: props.namespace,
        labels: { grafana_dashboard: '1' },
        annotations: { 'argocd.argoproj.io/sync-wave': '3' },
      },
      data: {
        'my-app-dashboard.json': fs.readFileSync('dashboards/my-app.json', 'utf-8'),
      },
    });
  }
}
```

The `grafana_dashboard: "1"` label is what the sidecar matches.
Keep the dashboard JSON in your integration repo and read it in at synth time.

## Add an alert rule

Alert rules are plain `PrometheusRule` resources you manage in your integration repo.
The prometheus-operator selects them in the monitoring namespace, so no extra wiring is needed.

Keep alert rules in your own construct or YAML beside the dashboard construct, scoped to the same namespace.

## Attach them beside the chart

Instantiate your constructs with the `MonitoringChart` as their scope, using the chart's namespace.

```typescript
import { App } from 'cdk8s';
import { MonitoringChart, mergeConfig } from '@bluedynamics/cdk8s-monitoring';
import { AppDashboardConstruct } from './app-dashboards/app-dashboard';

const app = new App();
const config = mergeConfig({ /* required cluster values */ });

const chart = new MonitoringChart(app, 'monitoring', config);
new AppDashboardConstruct(chart, 'my-app-dashboard', { namespace: config.namespace });

app.synth();
```

Because the construct is scoped to the chart and targets the same namespace, the dashboard `ConfigMap` synthesizes alongside the stack and the sidecar discovers it after deployment.

## Keep app resources out of the library

Do not add application dashboards or alerts to the library itself.
They belong in the integration chart that knows about the application.
This keeps the stack code shared across clusters and lets each cluster carry only its own dashboards.

## Next steps

- {doc}`provide-config` — the integration chart this construct attaches to.

## See also

- {doc}`../explanation/design-philosophy` — why the library stays application-agnostic.
- {doc}`../reference/sync-waves` — where dashboards fall in the rollout order.
