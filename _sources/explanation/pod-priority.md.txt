---
myst:
  html_meta:
    "description": "Why cdk8s-monitoring splits its pods into a capture role and a query role for scheduling priority."
    "property=og:description": "Why cdk8s-monitoring splits its pods into a capture role and a query role for scheduling priority."
    "property=og:title": "Pod priority"
    "keywords": "cdk8s, Kubernetes, monitoring, PriorityClass, eviction, preemption, memory pressure"
---

# Pod priority

This page explains why the stack assigns a priority class to its pods, and why it distinguishes two roles.

## Monitoring is needed most when the cluster is in trouble

When a node runs short of memory, the kubelet evicts pods, and the scheduler preempts lower-priority pods to place higher-priority ones.
Without a priority class, the monitoring pods compete on equal terms with every application.
They are then as likely to go as anything else, at the exact moment when their data explains what is happening.

A priority class above the application default keeps the monitoring stack running while the cluster sheds load.
For clusters without their own priority scheme, the library ships one class, `high-priority`, and assigns it to every pod.

## Not every monitoring pod is equally urgent

Some pods lose data when they stop.
Prometheus misses scrapes, and the gap stays in the history forever.
Alloy and the Loki write path drop log lines that the nodes produce in the meantime.
Alertmanager stops routing alerts, so the warning about the incident never arrives.
These pods form the **capture** role.

Other pods only answer questions about data that already exists.
Grafana, Thanos Query, Thanos Store, the Thanos Compactor, and the Loki read path can stop for a few minutes and resume where they left off.
A dashboard that does not load is annoying, but nothing is lost.
These pods form the **query** role.

The split lets a cluster with its own tiering place the two roles differently.
The capture role sits close to the cluster's critical services, while the query role can yield to the applications that serve customers.

## Why both roles default to the same class

A single built-in class is the simplest setup that protects the stack.
It does not assume anything about the classes your other workloads use.
Clusters that already have a tiering scheme set `priorityClasses.create` to `false` and map the two roles onto their own tiers.

## What priority does not do

A priority class decides who stays when resources run out.
It does not give a pod more resources.
If the stack's requests are too low for the actual load, the pods still get killed for exceeding their limits, whatever their priority.
Size `resources` so that the stack fits under normal load, and let priority handle the abnormal case.

## See also

- {doc}`../how-to/set-priority-classes` — map the two roles onto your own classes.
- {doc}`../reference/configuration-options` — the `priorityClasses` fields and the role of each workload.
