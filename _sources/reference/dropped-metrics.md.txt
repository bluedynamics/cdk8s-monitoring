---
myst:
  html_meta:
    "description": "Reference of the metrics and scrape endpoints cdk8s-monitoring drops before ingestion to bound Prometheus cardinality."
    "property=og:description": "Reference of the metrics and scrape endpoints cdk8s-monitoring drops before ingestion to bound Prometheus cardinality."
    "property=og:title": "Dropped metrics"
    "keywords": "cdk8s, Kubernetes, monitoring, Prometheus, cardinality, metricRelabelings, histogram"
---

# Dropped metrics

This page lists the series the stack drops at scrape time.
A dropped series never reaches Prometheus, Thanos, or Grafana.

## Dropped histogram buckets

The `ServiceMonitor`s for the Kubernetes API server and the kubelet both drop these metric names with a `metricRelabelings` rule of action `drop`.

| Regular expression | Matches |
|---|---|
| `apiserver_request_duration_seconds_bucket` | API server request latency buckets |
| `apiserver_request_sli_duration_seconds_bucket` | API server SLI latency buckets |
| `apiserver_request_body_size_bytes_bucket` | API server request body size buckets |
| `apiserver_response_sizes_bucket` | API server response size buckets |
| `etcd_request_duration_seconds_bucket` | etcd request latency buckets as seen by the API server |
| `apiserver_watch_(cache_read_wait_seconds\|list_duration_seconds\|events_sizes)_bucket` | API server watch cache buckets |
| `workqueue_(queue\|work)_duration_seconds_bucket` | Controller work queue latency buckets |
| `scheduler_plugin_execution_duration_seconds_bucket` | Scheduler plugin latency buckets |

The matching `_sum` and `_count` series stay.
Average latencies and request rates remain available; quantiles computed from buckets do not.

## Disabled scrape endpoints

| Setting | Effect |
|---|---|
| `kubelet.serviceMonitor.probes: false` | The kubelet `/metrics/probes` endpoint is not scraped, so no `prober_probe_duration_seconds` series exist. |
| `kubeProxy.enabled: false` | No kube-proxy target. |
| `kubeEtcd.enabled: false` | No etcd target. |
| `kubeControllerManager.enabled: false` | No kube-controller-manager target. |
| `kubeScheduler.enabled: false` | No kube-scheduler target. |

## See also

- {doc}`alerts-and-routing` — the alert rules that the disabled targets affect.
- {doc}`../explanation/platform-assumptions` — why the stack disables these targets.
