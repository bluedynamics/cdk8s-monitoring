---
myst:
  html_meta:
    "description": "Prepare a Kubernetes cluster for cdk8s-monitoring: External Secrets Operator, a Crossplane S3 provider config, and the prometheus-operator CRDs applied server-side."
    "property=og:description": "Prepare a Kubernetes cluster for cdk8s-monitoring: External Secrets Operator, a Crossplane S3 provider config, and the prometheus-operator CRDs applied server-side."
    "property=og:title": "Set up prerequisites"
    "keywords": "cdk8s, Kubernetes, External Secrets, Crossplane, prometheus-operator, CRDs"
---

# Set up prerequisites

This guide shows you how to prepare a cluster so that a cdk8s-monitoring integration chart synthesizes and deploys cleanly.
The library produces resources for other operators to reconcile, so those operators and their configuration must exist first.

## Install the build tools

You build and synthesize an integration chart on your workstation.

Install [Node.js](https://nodejs.org/) (LTS) and the cdk8s CLI.

```shell
npm install -g cdk8s-cli
```

Verify both.

```shell
node --version
cdk8s --version
```

## Install External Secrets Operator

The stack reads S3 credentials and the Grafana admin password through External Secrets Operator.
The library emits `ExternalSecret` resources; the operator turns them into Kubernetes secrets.

If the operator is not yet installed, follow the [External Secrets Operator installation guide](https://external-secrets.io/latest/introduction/getting-started/).

The integration chart references two stores by name.
Create the ones your cluster uses and point them at the namespaces that hold the source secrets.

- A `ClusterSecretStore` for the S3 credentials, pointing at the namespace that holds the Hetzner S3 credentials secret.
- A `ClusterSecretStore` for application secrets, pointing at the namespace that holds the Grafana admin secret.

Create the Grafana admin source secret so the operator has something to replicate.

```shell
kubectl create secret generic grafana-admin -n application-secrets \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='change-me'
```

## Install Crossplane and an S3 provider config

The stack provisions its Thanos and Loki buckets as Crossplane `Bucket` resources in the `crossplane-system` namespace.
Crossplane and the Upbound `provider-aws-s3` must be installed, and a `ProviderConfig` must point at your S3 endpoint.

If Crossplane is not yet installed, follow the [Crossplane installation guide](https://docs.crossplane.io/latest/software/install/) and the [provider-aws-s3 documentation](https://marketplace.upbound.io/providers/upbound/provider-aws-s3).

Provide credentials and a `ProviderConfig` that the `Bucket` resources can reference, with the S3 endpoint and region your integration chart will use.

```{important}
The `Bucket` resources land in the `crossplane-system` namespace, not the monitoring namespace.
The provider config and its credentials secret must live where Crossplane expects them.
```

## Apply the prometheus-operator CRDs

The kube-prometheus-stack Helm chart installs Prometheus, Grafana, and Alertmanager, but the prometheus-operator custom resource definitions are not Helm-managed.
Apply them server-side, pinned to the operator version your chart deploys.

```shell
kubectl apply --server-side -f \
  https://github.com/prometheus-operator/prometheus-operator/releases/download/v0.92.0/stripped-down-crds.yaml
```

Use the CRD release that matches the kube-prometheus-stack version in your configuration.
See {doc}`../reference/configuration-options` for the default versions the package ships.

```{warning}
Skipping the server-side CRD apply leaves Prometheus, Alertmanager, and the operator unable to start.
Apply the CRDs before you deploy the stack, and re-apply them whenever you bump the chart to a new major operator version.
```

## Verify the cluster

Confirm the operators and a default storage class are present.

```shell
kubectl get pods -n external-secrets
kubectl get pods -n crossplane-system
kubectl get crds | grep monitoring.coreos.com
kubectl get storageclasses
```

## Next steps

- {doc}`provide-config` — build your integration chart.
- {doc}`configure-s3-credentials` — wire the buckets and credentials in detail.

## See also

- {doc}`../explanation/architecture` — how the components depend on one another.
