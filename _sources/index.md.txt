---
myst:
  html_meta:
    "description": "Documentation for @bluedynamics/cdk8s-monitoring, a generic cdk8s construct library for a Prometheus, Thanos, Loki, Grafana, and Alloy monitoring stack on Kubernetes."
    "property=og:description": "Documentation for @bluedynamics/cdk8s-monitoring, a generic cdk8s construct library for a Prometheus, Thanos, Loki, Grafana, and Alloy monitoring stack on Kubernetes."
    "property=og:title": "cdk8s-monitoring documentation"
    "keywords": "cdk8s, Kubernetes, monitoring, Prometheus, Thanos, Loki, Grafana, Alloy"
---

# cdk8s-monitoring documentation

```{image} _static/kup6s-icon-monitoring.svg
:alt: cdk8s-monitoring logo
:width: 200px
:align: center
```

**A generic cdk8s construct library for a Kubernetes monitoring stack.**

`@bluedynamics/cdk8s-monitoring` synthesizes a complete observability stack with [cdk8s](https://cdk8s.io/): Prometheus, Thanos, Loki, Grafana, and Alloy, with Thanos long-term storage on S3-compatible object storage.

## About cdk8s-monitoring

The library is application-agnostic.
It ships only the stack, with sensible production defaults you override where needed.
Your own dashboards and alert rules live in your integration chart and attach beside the stack, so the same stack code is shared across clusters with no copy-paste.

**Key features:**

- Prometheus, Alertmanager, and Grafana through the kube-prometheus-stack Helm chart.
- Thanos Query, Store, and Compactor for long-term metrics with downsampling.
- Loki and Alloy for log aggregation and collection.
- S3 buckets and credentials wired through Crossplane and External Secrets Operator.
- ArgoCD sync-wave ordering baked into the orchestrator.
- A typed configuration split into required cluster values and overridable package defaults.

## Documentation structure

This documentation follows the [Diátaxis framework](https://diataxis.fr/), organized by what you need.

::::{grid} 2
:gutter: 3

:::{grid-item-card} Tutorials
:img-top: _static/kup6s-icon-tutorials.svg
:link: tutorials/index
:link-type: doc

**Learning-oriented**: step-by-step lessons to build skills.

*Start here if you are new to cdk8s-monitoring.*
:::

:::{grid-item-card} How-to guides
:img-top: _static/kup6s-icon-howto.svg
:link: how-to/index
:link-type: doc

**Goal-oriented**: solutions to specific problems.

*Use these when you need to accomplish something.*
:::

:::{grid-item-card} Reference
:img-top: _static/kup6s-icon-reference.svg
:link: reference/index
:link-type: doc

**Information-oriented**: technical specifications and configuration.

*Consult when you need detailed facts.*
:::

:::{grid-item-card} Explanation
:img-top: _static/kup6s-icon-explanation.svg
:link: explanation/index
:link-type: doc

**Understanding-oriented**: concepts and design decisions.

*Read to deepen your understanding.*
:::

::::

## Quick links

### Getting started

- {doc}`tutorials/01-quick-start` — synthesize and deploy a minimal stack.
- {doc}`how-to/setup-prerequisites` — prepare cluster infrastructure.
- {doc}`explanation/architecture` — see how the components fit together.

### Configuration

- {doc}`how-to/provide-config` — build your integration chart with `mergeConfig`.
- {doc}`reference/configuration-options` — complete configuration reference.

### Common tasks

- {doc}`how-to/add-app-dashboards` — attach your own dashboards and alerts.
- {doc}`how-to/override-defaults` — change resources, retention, and replicas.

## Table of contents

```{toctree}
---
maxdepth: 3
caption: Documentation
titlesonly: true
---
tutorials/index
how-to/index
reference/index
explanation/index
```
