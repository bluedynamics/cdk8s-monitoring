---
myst:
  html_meta:
    "description": "What cdk8s-monitoring assumes about the Kubernetes platform it runs on: the k3s helm-controller, Longhorn storage, GitOps with ArgoCD, and S3 object storage."
    "property=og:description": "What cdk8s-monitoring assumes about the Kubernetes platform it runs on: the k3s helm-controller, Longhorn storage, GitOps with ArgoCD, and S3 object storage."
    "property=og:title": "Platform assumptions"
    "keywords": "cdk8s, Kubernetes, monitoring, k3s, RKE2, helm-controller, Longhorn, ArgoCD, Crossplane"
---

# Platform assumptions

The library is application-agnostic, but it is not platform-agnostic.
It grew out of clusters that run k3s with Longhorn storage, deploy through ArgoCD, and keep long-term data in S3-compatible object storage.
This page explains where those roots show and what they mean for a cluster that looks different.

## Helm charts as Kubernetes resources

The stack does not run `helm install` itself.
It emits `HelmChart` resources, which the helm-controller that k3s and RKE2 ship turns into Helm releases inside the cluster.

This keeps the synthesized output declarative.
ArgoCD sees one resource per chart with the values inline, and a change to a value is a change to that resource.
No Helm client runs on a workstation or in a pipeline, and the release state lives in the cluster.

The price is a dependency on the helm-controller.
Other distributions can run it as a standalone controller.

The controller also brings a behavior that the library overrides.
By default, it answers a failed release by uninstalling and reinstalling it.
An uninstall deletes every Helm-owned persistent volume, including the Grafana database with its users, tokens, and shared dashboards.
Every `HelmChart` of the stack therefore sets `failurePolicy: abort`, which leaves a failed release in place for a human, as described in {doc}`../how-to/recover-failed-helm-release`.

## Control-plane scrapes that k3s does not offer

k3s runs the API server, the controller manager, and the scheduler in one process, and kube-proxy inside the agent.
There are no separate endpoints for the controller manager, the scheduler, kube-proxy, or the embedded etcd that the stock scrape configuration expects.

Left enabled, those scrape targets stay down forever, and the matching stock alerts such as `KubeProxyDown` fire on a healthy cluster.
The stack disables them.
On a distribution with separate control-plane components, you lose those targets until the library makes them configurable.

The single process has a second effect.
Because the API server endpoint serves the metrics of all embedded components, it carries a large number of histogram series that nothing in the stack reads.
The stack drops those buckets at scrape time, which cut the series count of a small cluster by roughly half.
The list is in {doc}`../reference/dropped-metrics`.

## Longhorn as the storage class

Every persistent volume asks for the `StorageClass` named `longhorn` unless `storage.className` says otherwise.
That default reflects where the library comes from rather than a requirement of the components; Prometheus, Loki, and Thanos run on any block storage.

## ArgoCD sync waves

The stack orders its resources with ArgoCD sync waves, from the namespace through storage and secrets to the workloads.
Other GitOps tools ignore the annotation, and so does `kubectl apply`.
The resources still converge, because each controller retries until its dependencies exist, but the first rollout takes longer and logs errors along the way.
The order is listed in {doc}`../reference/sync-waves`.

## Crossplane and External Secrets Operator

The stack creates its buckets as Crossplane `Bucket` resources and reads its credentials through External Secrets Operator.
Neither is optional today.
Both keep secrets and cloud resources declarative, which fits the GitOps model above: the synthesized manifests contain names and references, never credentials.

## When your platform differs

None of these assumptions is a design goal in itself.
They are the defaults of the clusters the library was built for.
Where a cluster differs, the library has started to turn assumptions into configuration: the cluster name, the priority classes, the storage class, and the names of the Crossplane and External Secrets resources were all hardcoded once.
If an assumption blocks you, open an issue in the [project tracker](https://github.com/bluedynamics/cdk8s-monitoring/issues).

## See also

- {doc}`../how-to/setup-prerequisites` — what to install before the first deployment.
- {doc}`architecture` — how the components fit together.
- {doc}`design-philosophy` — why the library is application-agnostic.
