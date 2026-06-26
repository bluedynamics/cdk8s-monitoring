---
myst:
  html_meta:
    "description": "How retention and downsampling work in cdk8s-monitoring: short local Prometheus retention, tiered Thanos raw, 5-minute, and 1-hour windows, and Loki log retention."
    "property=og:description": "How retention and downsampling work in cdk8s-monitoring: short local Prometheus retention, tiered Thanos raw, 5-minute, and 1-hour windows, and Loki log retention."
    "property=og:title": "Retention and downsampling"
    "keywords": "cdk8s, Kubernetes, monitoring, retention, downsampling, Thanos, Prometheus, Loki"
---

# Retention and downsampling

This page explains how long the stack keeps data and how it bounds the cost of keeping it.
The short answer is a tiered strategy: keep recent data at full resolution, then trade resolution for time as data ages.

## Local Prometheus retention

Prometheus keeps its own data for a short window, two days by default.
A short window is deliberate.
Local storage is on a persistent volume, and keeping it small keeps Prometheus fast to query and cheap to run.
Two days is comfortably longer than the time a Thanos sidecar needs to upload a completed block to S3, so nothing is lost when the local window rolls over.

Local retention answers recent queries directly from Prometheus, which is the common case for dashboards and active alerting.

## Long-term metrics in Thanos

Everything beyond the local window lives in S3 and is served by Thanos.
The Thanos Compactor enforces three retention windows, one per resolution.

Raw resolution
:   The original samples, kept for thirty days by default.

5-minute resolution
:   Downsampled data, kept for one hundred and eighty days by default.

1-hour resolution
:   Further downsampled data, kept for seven hundred and thirty days by default.

Downsampling is what makes long-range queries practical.
A two-year query at raw resolution would scan an enormous number of samples; the same query at one-hour resolution scans a tiny fraction and still renders a faithful trend.
Thanos Query picks an appropriate resolution for the time range automatically, so a dashboard spanning years stays responsive while a dashboard spanning hours stays precise.

Each window also bounds storage.
Raw data is the largest and is discarded first; the coarser resolutions are small enough to keep for years.

## Loki log retention

Logs follow the same principle of bounded cost, but without downsampling, since logs do not aggregate the way numeric samples do.
Loki keeps logs for a fixed retention, seven hundred and forty-four hours, or thirty-one days, by default, after which old chunks in S3 are removed.

## Tuning the windows

All of these values are defaults you can override per cluster.
A cluster with cheap storage might keep raw metrics longer; a cluster with strict cost limits might shorten log retention.
The {doc}`../how-to/override-defaults` guide shows how, and {doc}`../reference/configuration-options` lists every retention field and its default.

## See also

- {doc}`architecture` — how the Compactor and Store Gateway use these windows.
- {doc}`../reference/configuration-options` — the exact default values.
