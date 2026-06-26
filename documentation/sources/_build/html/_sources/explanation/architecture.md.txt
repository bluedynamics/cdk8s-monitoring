---
myst:
  html_meta:
    "description": "How the cdk8s-monitoring components fit together: Prometheus, Thanos, Loki, Alloy, and Grafana, the data they exchange, and the sync-wave ordering that brings them up."
    "property=og:description": "How the cdk8s-monitoring components fit together: Prometheus, Thanos, Loki, Alloy, and Grafana, the data they exchange, and the sync-wave ordering that brings them up."
    "property=og:title": "Architecture"
    "keywords": "cdk8s, Kubernetes, monitoring, architecture, Prometheus, Thanos, Loki, Grafana, Alloy"
---

# Architecture

This page explains how the parts of the stack relate to one another.
The stack covers two pillars of observability: metrics and logs.
Grafana sits on top of both as the single window into the data.

## The metrics pillar

Prometheus scrapes metrics from the cluster and stores them locally for a short window.
A short local retention keeps Prometheus fast and small, but it would lose history on its own.

This is where Thanos comes in.
A Thanos sidecar runs next to each Prometheus and uploads completed blocks to S3.
Three Thanos workloads then act on that object storage.

Thanos Store Gateway
:   Reads historical blocks from S3 and serves them over gRPC, so data older than the local Prometheus window is still queryable.

Thanos Compactor
:   Compacts small blocks into larger ones and downsamples raw data into lower resolutions, which keeps long-range queries fast and bounds storage growth.

Thanos Query
:   Fans a query out across the Prometheus replicas and the Store Gateway, deduplicates results, and returns a single answer.

Grafana queries Thanos Query rather than Prometheus directly.
That way a dashboard transparently spans recent local data and years of downsampled history.

## The logs pillar

Alloy runs as a DaemonSet on every node, collects pod logs, parses structured fields, and forwards them to Loki.
Loki runs in SimpleScalable mode, split into write, read, backend, and gateway components, and stores its chunks in S3.
Grafana queries Loki for logs, so metrics and logs live behind one interface.

## Object storage

Both pillars depend on S3-compatible object storage.
The stack provisions the buckets as Crossplane `Bucket` resources and replicates the access credentials into the namespace with External Secrets Operator.
Thanos consumes its credentials as an `objstore.yml` secret; Loki consumes its credentials as environment variables.

## How it comes up

The components depend on one another, so the order of creation matters.
The orchestrator encodes that order with ArgoCD sync waves.

```{mermaid}
:alt: Sync-wave dependency flow from foundation to advanced services

graph TD
    A[Wave 0: Namespace, PriorityClass] --> B[Wave 1: S3 buckets, credentials, Grafana password]
    B --> C[Wave 2: Prometheus stack, Loki]
    C --> D[Wave 3: Alloy, Thanos Query, Store, Compactor]
```

Foundation resources come first, then storage and secrets, then the core services that need them, and finally the collection, query, and long-term-storage layers.
The exact resource-to-wave mapping is in {doc}`../reference/sync-waves`.

## Where applications fit

The library stops at the stack.
It does not know about any application.
Dashboards and alerts for a specific application are attached by the integration chart and discovered at runtime by the Grafana sidecar and the prometheus-operator.
This separation is the subject of {doc}`design-philosophy`.

## See also

- {doc}`retention-and-downsampling` — how long data lives at each resolution.
- {doc}`../reference/sync-waves` — the precise rollout order.
