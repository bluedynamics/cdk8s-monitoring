---
myst:
  html_meta:
    "description": "How distributed tracing fits into cdk8s-monitoring: the Alloy OTLP gateway, tail sampling, Grafana Tempo on S3, and the correlation between traces, logs, and metrics."
    "property=og:description": "How distributed tracing fits into cdk8s-monitoring: the Alloy OTLP gateway, tail sampling, Grafana Tempo on S3, and the correlation between traces, logs, and metrics."
    "property=og:title": "Tracing architecture"
    "keywords": "cdk8s, Kubernetes, monitoring, tracing, Tempo, Alloy, OTLP, tail sampling"
---

# Tracing architecture

This page explains how distributed tracing fits into the stack.
Tracing is the third pillar of observability, next to metrics and logs.
It is opt-in: nothing on this page exists unless you set `tempo.enabled`.

## Why tracing is opt-in

The metrics and logs pillars are always on, because every cluster wants them.
Tracing is different.
It needs an extra object storage bucket, it only pays off once applications are instrumented, and its volume can grow quickly.

So the library treats tracing as additive.
When `tempo.enabled` is false the chart synthesizes no tracing resources at all, and the Grafana datasource block is byte-identical to a stack without tracing.
When you turn it on, four constructs appear and one Grafana datasource is added.
This keeps the feature non-breaking for every existing consumer.

## The components

Three workloads and an object storage bucket make up the tracing pillar.

Alloy traces gateway
:   A dedicated Alloy deployment, separate from the log-collection DaemonSet.
    It exposes a stable OTLP endpoint that applications send spans to, samples the traces, and forwards what it keeps to Tempo.

Tempo
:   A single-binary (monolithic) Grafana Tempo instance.
    It receives sampled traces over OTLP and writes trace blocks to S3, the same kind of object storage that backs Thanos and Loki.

The trace bucket
:   A Crossplane `Bucket` for trace blocks, with versioning and a lifecycle rule, provisioned the same way as the Thanos and Loki buckets.

Grafana
:   The existing Grafana gains a Tempo datasource, wired to jump from a trace to its logs and metrics.

## The data flow

Applications send OpenTelemetry spans to the gateway, which samples them and hands the survivors to Tempo, which persists them on S3.
Grafana reads from Tempo to display traces.

```{mermaid}
:alt: Spans flow from applications through the Alloy gateway to Tempo and S3, with Grafana reading from Tempo

graph LR
    A[Applications] -->|OTLP 4317 / 4318| B[Alloy traces gateway]
    B -->|tail sampling| C[Tempo monolithic]
    C -->|trace blocks| D[(S3)]
    E[Grafana] -->|Tempo datasource| C
```

Applications target the gateway service at `alloy-traces.<namespace>.svc.cluster.local`, on port `4317` for OTLP gRPC and `4318` for OTLP HTTP.
The library accepts OTLP only; it does not ingest Jaeger or Zipkin.

## Tail sampling

Storing every span of every request is wasteful, and most of those spans describe requests that behaved exactly as expected.
The gateway therefore samples, and it samples on the *tail*: it waits until a trace is complete before deciding whether to keep it.

Tail sampling lets the decision use the whole trace.
The gateway keeps a trace when any of these hold.

- The trace contains an error span.
- The trace is slower than `tempo.tailSampling.latencyThresholdMs`.
- The trace falls into the `tempo.tailSampling.probabilisticPercent` percent of remaining traces kept as a representative sample.

The first two rules capture the traces you almost always want: failures and slow requests.
The third keeps a slice of ordinary traffic so that a healthy baseline is still visible.

## Why the gateway is a single replica

A tail-sampling decision needs every span of a trace in one place.
If two gateway replicas each received half the spans of a trace, neither could see the whole trace, and the decision would be wrong.

The gateway is therefore fixed at one replica.
This is a deliberate trade-off: one instance is the simplest correct design, and a single Alloy pod handles a large span rate.

Scaling the gateway horizontally is possible, but it requires a two-tier setup where a first tier load-balances spans to a second tier by trace ID, so that all spans of a trace still land on one sampler.
That is a future option, not part of the current design.

## Correlation with logs and metrics

A trace is most useful when you can pivot from it to the other pillars.
The Tempo datasource is configured for two jumps.

Traces to logs
:   From a span, Grafana queries Loki for the logs of the same request, matched by `trace_id`.
    This turns a slow or failing span directly into the log lines it produced.

Traces to metrics
:   From a span, Grafana links to the related metrics in Thanos.
    This places a single request in the context of the service's overall behavior.

Generating metrics from spans, such as service graphs or span-derived RED metrics, is out of scope.
The stack correlates with the metrics Prometheus already collects rather than deriving new ones from traces.

## Where applications fit

As with dashboards and alerts, the library stops at the stack.
It provisions the backend, the gateway, and the datasource, but it does not instrument any application.
Each application owns its own OpenTelemetry SDK setup and points its exporter at the gateway endpoint.
This mirrors the separation described in {doc}`design-philosophy`.

## See also

- {doc}`../how-to/enable-tracing` — turn tracing on and point applications at the gateway.
- {doc}`../how-to/configure-tail-sampling` — tune which traces are kept.
- {doc}`architecture` — the metrics and logs pillars this builds on.
