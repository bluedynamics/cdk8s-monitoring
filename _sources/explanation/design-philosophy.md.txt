---
myst:
  html_meta:
    "description": "Why cdk8s-monitoring is application-agnostic and why it splits configuration into package defaults and required cluster values."
    "property=og:description": "Why cdk8s-monitoring is application-agnostic and why it splits configuration into package defaults and required cluster values."
    "property=og:title": "Design philosophy"
    "keywords": "cdk8s, Kubernetes, monitoring, design, application-agnostic, defaults, configuration"
---

# Design philosophy

This page explains the two decisions that shape the library: it is application-agnostic, and it splits configuration into package defaults and required cluster values.
Both choices serve the same goal, which is to let several clusters share one stack without copying code.

## Why the library is application-agnostic

A monitoring stack is the same everywhere.
What differs between deployments is which applications they watch, and therefore which dashboards and alerts they carry.
If the library bundled application dashboards, every consumer would inherit dashboards for applications it does not run, and adding a new application would mean changing the shared library.

So the library ships only the stack.
It enables the Grafana sidecar that discovers dashboards and lets the prometheus-operator select alert rules, but it provides none of its own.
An integration chart attaches its dashboards and alerts beside the `MonitoringChart`, in the same namespace, and the running stack finds them.
The plug-in mechanism is just two conventions: a `ConfigMap` labeled `grafana_dashboard: "1"` and a `PrometheusRule` in the namespace.

The benefit is decoupling.
The stack code lives in one place and is identical across clusters.
Each cluster owns only what is unique to it.
The {doc}`../how-to/add-app-dashboards` guide is the litmus test that this decoupling is genuinely usable.

An alternative would have been a callback or registration API in the library through which consumers inject dashboards.
That would add surface area and coupling for no gain, since the integration chart can simply instantiate its own constructs.
The library stays smaller by doing less.

## Why configuration is split

The configuration falls into two natural classes.

Some values are universal.
The chart versions, the resource requests and limits, the retention windows, the storage sizes, and the replica counts are sensible defaults that most clusters can use unchanged.
These live in `DEFAULT_CONFIG` as `DefaultableConfig`.

Other values have no sensible universal default.
The namespace, the Grafana domain, the S3 endpoint and buckets, and the SMTP server are specific to each cluster.
These are `RequiredClusterConfig`, and the type system makes them mandatory.

`mergeConfig` joins the two: it takes the required values verbatim and deep-merges any overrides over the defaults.
Because the merge is deep, an integration chart can override a single nested key without restating the surrounding object.

The payoff is a short, honest integration chart.
A consumer writes only what is true about its cluster, and the compiler refuses to let it forget a required value.
The roughly one hundred lines of environment-variable boilerplate that a hand-rolled stack would carry simply disappear.

## How the two decisions reinforce each other

Application-agnostic code and split configuration are the same idea applied to behavior and to data.
The library owns what is common, in code and in defaults.
The integration chart owns what is specific, in attached constructs and in required values.
Drawing the line in the same place for both keeps the shared part genuinely shareable.

## See also

- {doc}`architecture` — the components this philosophy organizes.
- {doc}`../how-to/provide-config` — the split configuration in practice.
