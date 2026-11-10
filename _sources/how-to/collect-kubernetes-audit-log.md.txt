# Collect the Kubernetes API audit log

This guide shows you how to ship the Kubernetes API audit log from the control planes into Loki, so that every Secret read, token request or RBAC change is searchable next to the pod logs.

```{seealso}
[Configuration options](../reference/configuration-options.md) lists every `auditLog` key.
```

## Prerequisites

- The API server writes an audit log to a directory on each control plane.
  On k3s that is `audit-policy-file` and `audit-log-path` in the server configuration; kube-hetzner exposes them as `k3s_audit_policy_config` and `k3s_audit_log_path`.
- The control planes carry the label `node-role.kubernetes.io/control-plane: "true"` and the matching taint, as k3s sets them.
  Pass another `nodeSelector` if your distribution labels them differently.

## Enable the collector

```typescript
const config = mergeConfig({
  // ...
  auditLog: {
    enabled: true,
  },
});
```

That adds the HelmChart `alloy-audit`: an Alloy DaemonSet that runs only on the control planes, tails `/var/log/k3s-audit/*.log` and sends every line to the Loki gateway with the labels `job="k3s-audit"`, `node` and `cluster`.
Verb, user, resource and namespace of each event arrive as structured metadata; the JSON line itself stays intact.

If your API server writes somewhere else, set the directory:

```typescript
auditLog: {
  enabled: true,
  path: '/var/log/kubernetes/audit',
},
```

## Query the log

In Grafana Explore, pick the Loki datasource and start from the job label:

```text
{job="k3s-audit", cluster="example"} | user =~ "system:serviceaccount:.*" | resource = "secrets"
```

The structured metadata fields `verb`, `user`, `resource` and `namespace` filter without parsing.
For anything else, parse the line:

```text
{job="k3s-audit"} | json | responseStatus_code >= 400
```

## Alert on identities with Prometheus

The collector also counts every audit event in the Prometheus counter `loki_process_custom_k3s_audit_events_total` with the labels `user`, `verb`, `resource`, `namespace`, `code` and `node`, scraped through a ServiceMonitor labelled `release: kube-prometheus-stack`.
Write your alert rules as `PrometheusRule`s beside the chart, with the identities of your cluster:

```yaml
- alert: AuditSecretAccessByUnexpectedIdentity
  expr: >-
    sum by (user, verb, namespace) (
      increase(loki_process_custom_k3s_audit_events_total{resource="secrets",
        user!~"system:(apiserver|k3s-supervisor|kube-controller-manager|serviceaccount:(external-secrets|argocd|cert-manager|monitoring):.*)"}[10m])
    ) > 0
  labels: { severity: warning }
```

The counter keeps a series for five minutes after the last event, so use `increase` over a window of at least ten minutes.

## What the collector may do

The API server creates the audit files as root with mode 0600, so the Alloy container runs as uid 0, and as the SELinux type `spc_t`, because on enforcing hosts such as openSUSE MicroOS the default `container_t` may not write the positions directory on the host.
It drops every Linux capability, mounts the audit directory read-only, has no Kubernetes API access (`rbac.create: false`) and keeps its read positions in `/var/lib/alloy-audit` on the host, so a restart does not re-ingest the files.
The regular `alloy` DaemonSet is unchanged and still does not run on the control planes.
