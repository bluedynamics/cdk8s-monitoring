---
myst:
  html_meta:
    "description": "Goal-oriented how-to guides for configuring and extending the cdk8s-monitoring stack."
    "property=og:description": "Goal-oriented how-to guides for configuring and extending the cdk8s-monitoring stack."
    "property=og:title": "How-to guides"
    "keywords": "cdk8s, Kubernetes, monitoring, how-to, configuration, dashboards"
---

```{image} ../_static/kup6s-icon-howto.svg
:align: center
:class: section-icon-large
```

# How-to guides

**Goal-oriented guides that show you how to solve specific problems with cdk8s-monitoring.**

How-to guides are recipes.
They assume you already know what you want and show you how to get there.
For background and concepts, see the {doc}`../explanation/index` instead.

## Prerequisites

```{toctree}
---
maxdepth: 1
titlesonly: true
---
setup-prerequisites
```

## Configuration

```{toctree}
---
maxdepth: 1
titlesonly: true
---
provide-config
override-defaults
configure-s3-credentials
configure-smtp-alerting
enable-tracing
configure-tail-sampling
```

## Extending the stack

```{toctree}
---
maxdepth: 1
titlesonly: true
---
add-app-dashboards
```

---

**New to cdk8s-monitoring?** Start with the {doc}`../tutorials/index`.

**Need exact configuration values?** See the {doc}`../reference/index`.
