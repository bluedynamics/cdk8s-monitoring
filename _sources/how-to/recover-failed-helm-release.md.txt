---
myst:
  html_meta:
    "description": "Recover a monitoring stack Helm release that the k3s helm-controller left in state failed, without losing Grafana's database."
    "property=og:description": "Recover a monitoring stack Helm release that the k3s helm-controller left in state failed, without losing Grafana's database."
    "property=og:title": "Recover a failed Helm release"
    "keywords": "cdk8s, Kubernetes, monitoring, Helm, helm-controller, k3s, failurePolicy, Grafana"
---

# Recover a failed Helm release

This guide shows you how to bring a monitoring stack release back to `deployed` after an upgrade failed.

Every `HelmChart` this library emits sets `spec.failurePolicy: abort`.
When a release ends up in state `failed`, the k3s helm-controller stops and waits for you instead of uninstalling and reinstalling it.
An automatic reinstall would delete every Helm-owned PVC, including Grafana's database with its service accounts, tokens, and public dashboards.

## Find the failed release

List the releases in the monitoring namespace and look for the status `failed`.

```shell
helm list -n monitoring --all
```

Read the install job log of the affected chart to learn why the upgrade failed.

```shell
kubectl logs -n monitoring job/helm-install-kube-prometheus-stack
```

Replace `kube-prometheus-stack` with the name of the failed release.
The job keeps failing with a message that the failure policy is `abort` until you intervene.

## Fix the cause

Fix whatever made the upgrade fail, typically a values change or a chart version bump in your integration chart.
Synthesize and deploy the corrected manifests as usual.

## Roll back to the last deployed revision

Show the revision history and note the last revision with status `deployed` or `superseded`.

```shell
helm history kube-prometheus-stack -n monitoring
```

Roll back to that revision.

```shell
helm rollback kube-prometheus-stack 8 -n monitoring
```

Replace `8` with the revision you noted.
The release is now `deployed` again, and its PVCs stay untouched.

If the release has no earlier good revision, because its very first install failed, nothing is lost by removing it.
In that case run `helm uninstall` on it instead of rolling back.

## Let the helm-controller apply the current values

The next install job run upgrades the rolled-back release to the values from the `HelmChart`.
If the job already gave up, delete it, and the helm-controller creates a new one.

```shell
kubectl delete job -n monitoring helm-install-kube-prometheus-stack
```

## Verify the recovery

Confirm the release is `deployed` at a new revision and the Grafana PVC kept its original creation time.

```shell
helm list -n monitoring
kubectl get pvc -n monitoring kube-prometheus-stack-grafana -o jsonpath='{.metadata.creationTimestamp}'
```

## See also

- {doc}`../reference/sync-waves` — which construct emits which `HelmChart`.
