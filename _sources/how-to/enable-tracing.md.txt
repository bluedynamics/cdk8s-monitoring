---
myst:
  html_meta:
    "description": "Enable distributed tracing in cdk8s-monitoring: provide an S3 bucket, set tempo.enabled and tempo.bucket, and point applications at the Alloy OTLP gateway."
    "property=og:description": "Enable distributed tracing in cdk8s-monitoring: provide an S3 bucket, set tempo.enabled and tempo.bucket, and point applications at the Alloy OTLP gateway."
    "property=og:title": "Enable tracing"
    "keywords": "cdk8s, Kubernetes, monitoring, tracing, Tempo, Alloy, OTLP, S3"
---

# Enable tracing

This guide shows you how to turn on distributed tracing with Grafana Tempo.
Tracing is opt-in; with the default configuration no tracing resources are created.

When you enable it, the stack adds a Tempo backend, an Alloy OTLP gateway, a trace bucket, and a Grafana Tempo datasource.
For the concepts behind these pieces, see {doc}`../explanation/tracing-architecture`.

## Prerequisites

Tracing reuses the same object storage integration as Thanos and Loki.
Before you start, make sure the cluster already has the resources described in {doc}`configure-s3-credentials`: a Crossplane provider config, an External Secrets store, and the source credentials key.
Tempo's trace bucket and credentials are provisioned through those same `integrations` names.

## Choose a bucket name

Tracing needs its own S3 bucket for trace blocks.
Pick a name that does not collide with your Thanos or Loki buckets.
The library creates the bucket for you through Crossplane; you only supply the name.

## Enable Tempo

Set `tempo.enabled` to `true` and `tempo.bucket` to your chosen bucket name in the `mergeConfig` input.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  tempo: {
    enabled: true,
    bucket: 'traces-tempo-prod',
  },
});
```

`tempo.bucket` is required whenever `tempo.enabled` is true.
If you enable tracing without a bucket name, `mergeConfig` throws `tempo.bucket is required when tempo.enabled is true`.

The other `tempo` fields keep their defaults unless you override them.
To change which traces are kept, see {doc}`configure-tail-sampling`.

## Point applications at the gateway

Applications send OpenTelemetry spans to the gateway service, not to Tempo directly.
Configure each application's OTLP exporter to target the gateway in the monitoring namespace.

OTLP gRPC
:   `alloy-traces.<namespace>.svc.cluster.local:4317`

OTLP HTTP
:   `alloy-traces.<namespace>.svc.cluster.local:4318`

Replace `<namespace>` with the namespace you set in `config.namespace`.
The gateway accepts OTLP only; it does not accept Jaeger or Zipkin.

Instrumenting an application is out of scope for this library.
Each application configures its own OpenTelemetry SDK and exporter endpoint.

## Verify

After deployment, confirm the trace bucket reconciled, the credentials secret materialized, and the workloads are running.

```shell
kubectl get buckets.s3.aws.upbound.io -n crossplane-system
kubectl get secret tempo-s3-credentials -n monitoring
kubectl get pods -n monitoring -l app.kubernetes.io/name=tempo
kubectl get pods -n monitoring -l app.kubernetes.io/name=alloy-traces
```

Open Grafana and confirm a `Tempo` datasource is present.
Once an instrumented application sends spans, its traces appear under that datasource.

## See also

- {doc}`configure-tail-sampling` — tune which traces Tempo keeps.
- {doc}`../explanation/tracing-architecture` — how the gateway, Tempo, and Grafana fit together.
- {doc}`../reference/configuration-options` — every `tempo` field and its default.
