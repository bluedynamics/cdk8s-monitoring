---
myst:
  html_meta:
    "description": "Run the cdk8s-monitoring pods under your cluster's own PriorityClasses instead of the built-in high-priority class."
    "property=og:description": "Run the cdk8s-monitoring pods under your cluster's own PriorityClasses instead of the built-in high-priority class."
    "property=og:title": "Use your own priority classes"
    "keywords": "cdk8s, Kubernetes, monitoring, PriorityClass, scheduling, eviction"
---

# Use your own priority classes

This guide shows you how to run the stack's pods under the `PriorityClass`es your cluster already defines.
By default, the stack creates one class named `high-priority` and assigns it to every pod.

## Pick a class for each role

The stack splits its pods into two roles.

`capture`
:   Pods that ingest metrics, logs, or traces, or that route alerts.
    Losing one of them loses data or alerts.

`query`
:   Pods that only answer queries.
    They can wait while a node runs short of memory.

Choose an existing class for each role.
Give `capture` a class at least as high as `query`.

```shell
kubectl get priorityclasses
```

## Set the classes

Set `create: false` so the stack no longer creates `high-priority`, and name your classes.

```typescript
const config = mergeConfig({
  // required cluster values ...
  priorityClasses: {
    create: false,
    capture: 'tier-critical',
    query: 'tier-high',
  },
});
```

```{important}
The classes you name must exist before the stack syncs.
Kubernetes rejects a pod that names a missing `PriorityClass`, and the workload stays at zero ready replicas.
```

If you only want different classes and still want the library's `high-priority` class to exist, keep `create: true`.

## Roll out the change

Synthesize and deploy your integration chart.

```shell
npx cdk8s synth
```

The Helm-managed workloads and the Thanos workloads pick up the new `priorityClassName` with their next rollout.
If you set `create: false` on a cluster that already runs the stack, the `high-priority` class leaves the manifests, and ArgoCD deletes it when pruning is on.
Running pods keep their priority, but any other workload that still names `high-priority` can no longer create pods.
Check for such workloads before you sync.

```shell
kubectl get pods -A -o custom-columns=NS:.metadata.namespace,POD:.metadata.name,PRIO:.spec.priorityClassName | grep high-priority
```

## Verify

List the priority class of every pod in the monitoring namespace.

```shell
kubectl get pods -n monitoring -o custom-columns=POD:.metadata.name,PRIO:.spec.priorityClassName
```

Each pod shows the class of its role.
The role of every workload is listed in {doc}`../reference/configuration-options`.

## See also

- {doc}`../explanation/pod-priority` — why the stack splits its pods into two roles.
- {doc}`../reference/sync-waves` — when the `high-priority` class is created.
