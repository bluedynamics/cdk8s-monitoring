---
myst:
  html_meta:
    "description": "Tune tail sampling for the cdk8s-monitoring Alloy traces gateway: set the latency threshold and the probabilistic percentage that decide which traces Tempo keeps."
    "property=og:description": "Tune tail sampling for the cdk8s-monitoring Alloy traces gateway: set the latency threshold and the probabilistic percentage that decide which traces Tempo keeps."
    "property=og:title": "Configure tail sampling"
    "keywords": "cdk8s, Kubernetes, monitoring, tracing, tail sampling, Tempo, Alloy"
---

# Configure tail sampling

This guide shows you how to tune which traces the Alloy gateway keeps.
It assumes tracing is already enabled; if not, see {doc}`enable-tracing` first.

The gateway tail-samples: it waits for a trace to complete, then decides whether to store it.
You control that decision through the `tempo.tailSampling` fields.
For the reasoning behind tail sampling, see {doc}`../explanation/tracing-architecture`.

## The sampling policy

The gateway keeps a trace when any of these hold.

- The trace contains an error span. This rule is always on and is not configurable.
- The trace is slower than `tempo.tailSampling.latencyThresholdMs` milliseconds.
- The trace is in the `tempo.tailSampling.probabilisticPercent` percent of the remaining traces kept as a representative sample.

Every error and every slow trace is kept regardless of the probabilistic percentage.
The percentage applies only to the traces that are neither errors nor slow.

## Set the thresholds

Override the two fields in your `mergeConfig` input.
The values below show the defaults.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  tempo: {
    enabled: true,
    bucket: 'traces-tempo-prod',
    tailSampling: {
      latencyThresholdMs: 1000,
      probabilisticPercent: 10,
    },
  },
});
```

## Tune for your traffic

If you want to keep more of your slow traces, lower `latencyThresholdMs`.
For example, set it to `500` to keep every trace slower than half a second.
To keep only the genuinely slow ones, raise it.

If you want a denser sample of ordinary traffic, raise `probabilisticPercent`.
To cut storage and trace volume, lower it; errors and slow traces are still kept in full.

Set `probabilisticPercent` to `0` to keep **only** errors and slow traces.
At `0` the probabilistic policy is omitted entirely, so every fast, non-error trace is dropped at the gateway and never reaches Tempo.
This is the most aggressive volume reduction and pairs well with a latency threshold set to where "good enough" ends for your service (for example `300`).

```{important}
The gateway runs as a single replica so that one instance sees every span of a trace, which tail sampling requires.
Changing the sampling thresholds does not change this; do not scale the gateway up to increase throughput, because that would split a trace's spans across replicas and corrupt the sampling decision.
```

## Verify

The thresholds are baked into the gateway's Alloy configuration at synth time.
After deployment, confirm the gateway restarted with the new values.

```shell
kubectl rollout status deployment/alloy-traces -n monitoring
```

Send traffic through an instrumented application, then confirm in Grafana that error and slow traces appear while ordinary traces are present only as a sample.

## See also

- {doc}`enable-tracing` — turn tracing on and point applications at the gateway.
- {doc}`../reference/configuration-options` — the `tempo.tailSampling` fields and defaults.
- {doc}`../explanation/tracing-architecture` — why the gateway is a single replica.
