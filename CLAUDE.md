# Claude Code Project Guide

Context and guidelines for Claude Code when working on **@bluedynamics/cdk8s-monitoring**.

## Project Overview

A generic, application-agnostic cdk8s construct library for a Kubernetes monitoring stack (Prometheus, Thanos, Loki, Grafana, Alloy) with Thanos long-term storage on S3. It is consumed by per-cluster integration charts (e.g. kup6s `dp-infra/monitoring`, helix `helix-infra-charts/monitoring`), which provide cluster-specific config and attach their own app dashboards and alert rules.

TypeScript only — no JSII, no Python binding.

## Build System

This project uses **projen**. Do not edit generated files directly (`package.json`, `tsconfig.json`, `.eslintrc.json`, GitHub workflows, etc.).

1. Edit `.projenrc.ts` for project configuration changes.
2. Run `npx projen` to regenerate files.
3. Make code changes in `src/`.
4. Run `npx projen test`; update Jest snapshots with `npx projen test -- -u` if needed.

### Common commands

```shell
npx projen          # regenerate project files after editing .projenrc.ts
npx projen build    # compile + test + lint + package
npx projen test     # run tests
npx projen eslint   # lint (uses the projen eslint compat task, not bare eslint)
```

Note: bare `eslint` fails (eslint v9 flat-config vs. projen's `.eslintrc.json`); always lint via `npx projen eslint`.

## Project Structure

```
src/
  index.ts            # public exports
  monitoring-chart.ts # orchestrator (sync-waves); app-agnostic
  types.ts            # config interfaces + DeepPartial + MonitoringConfigInput
  default-config.ts   # DEFAULT_CONFIG + mergeConfig (deep-merge)
  constructs/         # the 12 generic stack constructs
  imports/            # generated cdk8s imports (k8s, ESO, S3); excluded from lint
test/                 # Jest tests, one per construct + orchestrator + default-config
examples/synth.ts     # minimal synthesizable integration
documentation/        # Sphinx/MyST docs (Diataxis, plone-doc-style)
```

## Design Rules

- **App-agnostic**: never add cluster- or application-specific resources (dashboards, alert rules, domains) to this library. Integration charts attach those beside `MonitoringChart`.
  - *Exception — generic infra monitors*: monitors for infrastructure components that are generic across clusters using this stack (Traefik ingress, Longhorn storage) may live here as **opt-in, off-by-default** constructs (`config.traefik`, `config.longhorn`), including their scrape config and — gated by their own sub-toggle — the matching generic dashboard/alert. They must stay disabled unless a consumer explicitly enables them. This is *not* a license for anything cluster- or app-specific.
- **Defaults in the package, overrides in the chart**: universal values live in `DEFAULT_CONFIG`; cluster-specific values are required input. `mergeConfig` deep-merges.
- **Generated `imports/` are not hand-edited** and are excluded from lint/style.

## Git Workflow

Never merge directly to `main`. Use feature branches and pull requests:

```shell
git checkout -b feat/description   # or fix/, docs/, chore/, refactor/, test/
```

## Documentation

Sphinx with the Diataxis framework, authored in plone-doc-style (American English, one sentence per line, sentence-case headings, dash filenames, sparse admonitions).

```shell
cd documentation
make docs        # build HTML (must be warning-free)
make docs-live   # live-reload server
```

## Publishing

Releases go to npm as `@bluedynamics/cdk8s-monitoring` via the projen release flow. Do not hand-publish unless explicitly asked.

## Maintainer

Jens W. Klein (jk@kleinundpartner.at), Blue Dynamics Alliance.
