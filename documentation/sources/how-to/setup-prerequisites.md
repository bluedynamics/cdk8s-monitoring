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

## Check the Helm controller

The stack installs kube-prometheus-stack, Loki, Alloy, and Tempo as `HelmChart` resources of the API group `helm.cattle.io`.
The helm-controller that k3s and RKE2 ship reconciles them.
On another distribution, install the [helm-controller](https://github.com/k3s-io/helm-controller) yourself.

```shell
kubectl get crd helmcharts.helm.cattle.io
```

## Provide the storage classes

Every persistent volume of the stack, except the one for Alertmanager, requests the `StorageClass` named `longhorn`.
The Alertmanager volume uses the cluster's default `StorageClass`.

Install [Longhorn](https://longhorn.io/docs/latest/deploy/install/), or create a `StorageClass` named `longhorn` that points at the provisioner you use.
The class name is not configurable yet; see [issue #35](https://github.com/bluedynamics/cdk8s-monitoring/issues/35).

## Install External Secrets Operator

The stack reads S3 credentials and the Grafana admin password through External Secrets Operator.
The library emits `ExternalSecret` resources; the operator turns them into Kubernetes secrets.

If the operator is not yet installed, follow the [External Secrets Operator installation guide](https://external-secrets.io/latest/introduction/getting-started/).

The integration chart references two stores by name, supplied through its `integrations` block.
Create the stores your cluster uses, point them at the namespaces that hold the source secrets, and pass their names to the chart.

- A `ClusterSecretStore` for the S3 credentials, named by `integrations.s3SecretStore`, pointing at the namespace that holds the S3 credentials secret.
- A `ClusterSecretStore` for the Grafana admin credentials, named by `integrations.grafanaSecretStore`, pointing at the namespace that holds the Grafana admin secret.

Create the Grafana admin source secret so the operator has something to replicate.
The secret name and its namespace are your cluster's choice; the chart reaches it through `integrations.grafanaCredentialsKey`.

```shell
kubectl create secret generic my-grafana-admin -n application-secrets \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='change-me'
```

## Install Crossplane and an S3 provider config

The stack provisions its Thanos and Loki buckets as Crossplane `Bucket` resources in the `crossplane-system` namespace.
Crossplane and the Upbound `provider-aws-s3` must be installed, and a `ProviderConfig` must point at your S3 endpoint.

If Crossplane is not yet installed, follow the [Crossplane installation guide](https://docs.crossplane.io/latest/software/install/) and the [provider-aws-s3 documentation](https://marketplace.upbound.io/providers/upbound/provider-aws-s3).

Provide credentials and a `ProviderConfig` that the `Bucket` resources can reference, with the S3 endpoint and region your integration chart will use.
Pass the provider config name to the chart as `integrations.s3ProviderConfig`.

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

## Provide the priority classes

By default, the stack creates its own `PriorityClass` named `high-priority` and needs nothing from you.
If your cluster defines its own classes and you set `priorityClasses.create` to `false`, create those classes before the first sync.
See {doc}`set-priority-classes`.

## Verify the cluster

Confirm the operators, the CRDs, and the storage classes are present.

```shell
kubectl get crd helmcharts.helm.cattle.io
kubectl get pods -n external-secrets
kubectl get pods -n crossplane-system
kubectl get crds | grep monitoring.coreos.com
kubectl get storageclass longhorn
kubectl get storageclasses
```

The last command must show one class marked `(default)` for the Alertmanager volume.

## Next steps

- {doc}`provide-config` — build your integration chart.
- {doc}`configure-s3-credentials` — wire the buckets and credentials in detail.

## See also

- {doc}`../explanation/architecture` — how the components depend on one another.
