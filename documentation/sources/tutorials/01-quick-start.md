---
myst:
  html_meta:
    "description": "Build a minimal integration chart with cdk8s-monitoring, synthesize the manifests, and deploy the monitoring stack to a test cluster."
    "property=og:description": "Build a minimal integration chart with cdk8s-monitoring, synthesize the manifests, and deploy the monitoring stack to a test cluster."
    "property=og:title": "Quick start"
    "keywords": "cdk8s, Kubernetes, monitoring, quick start, synth, deploy"
---

# Quick start

In this tutorial you build a tiny integration chart with `@bluedynamics/cdk8s-monitoring`, synthesize it into Kubernetes manifests, and deploy the stack to a test cluster.
By the end you will have Prometheus, Grafana, Loki, Alloy, and Thanos running, and you will understand how a cluster supplies its own configuration to the shared stack.

The dish you cook here is a working stack.
The skills you take away are how to provide required cluster values, how `mergeConfig` fills in the defaults, and how the manifests reach the cluster through sync waves.

## Before you start

You need a cluster with the stack prerequisites already in place.
Setting them up is a separate task, so follow {doc}`../how-to/setup-prerequisites` first if you have not.
You also need Node.js and the cdk8s CLI, covered in the same guide.

This tutorial deploys real workloads with persistent volumes.
Use a test cluster, not production.

## Step 1: Create the project

Create an empty directory and initialize a TypeScript cdk8s app.

```shell
mkdir monitoring-quickstart
cd monitoring-quickstart
cdk8s init typescript-app
```

Notice that cdk8s generates a `main.ts`, a `package.json`, and an `imports/` directory.
You will replace the contents of `main.ts` in a moment.

## Step 2: Install the library

Add the construct library and its peer dependencies.

```shell
npm install @bluedynamics/cdk8s-monitoring cdk8s cdk8s-plus-33 constructs
```

## Step 3: Write the integration chart

Replace the contents of `main.ts` with the minimal integration below.

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
    buckets: { thanos: 'example-thanos', loki: 'example-loki' },
  },
  smtp: {
    host: 'mail.example.com',
    port: 587,
    from: 'monitoring@example.com',
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

Replace the `integrations` names with the Crossplane provider config and External Secrets stores your cluster actually has; see {doc}`../how-to/configure-s3-credentials`.

Notice that you provide only the five cluster-specific blocks: `namespace`, `domains`, `s3`, `smtp`, and `integrations`.
You do not set any versions, retention, storage, replicas, or resources.
`mergeConfig` fills those in from the package defaults, so this short input is a complete configuration.

## Step 4: Synthesize the manifests

Run the cdk8s synth step.

```shell
npx cdk8s synth
```

You should see a new `dist/` directory with a YAML file for the `monitoring` chart.
Open it and notice that every resource carries an `argocd.argoproj.io/sync-wave` annotation.
The values run from `0` to `3`, which is how the stack orders its own rollout.

## Step 5: Deploy the stack

Apply the synthesized manifest.

```shell
kubectl apply -f dist/monitoring.k8s.yaml
```

The manifest contains Crossplane and External Secrets resources, Helm chart resources, and plain Kubernetes objects.
The cluster controllers reconcile them, so the stack comes up over a few minutes rather than instantly.

## Step 6: Watch it come up

Watch the pods in the monitoring namespace.

```shell
kubectl get pods -n monitoring --watch
```

You will see Prometheus, Grafana, Alertmanager, the Loki components, Alloy, and the three Thanos workloads appear and move to `Running`.
Once Grafana is ready, open it through your ingress to confirm the stack is live.

## What you built

You wrote a complete integration chart in a few lines, synthesized it, and deployed a full monitoring stack.
You saw that the library carries every default, so an integration chart only supplies what is unique to its cluster.

## Next steps

- {doc}`../how-to/provide-config` — turn this throwaway script into a maintainable integration chart.
- {doc}`../how-to/add-app-dashboards` — attach your own dashboards to the running Grafana.
- {doc}`../explanation/architecture` — understand the components you just deployed.
