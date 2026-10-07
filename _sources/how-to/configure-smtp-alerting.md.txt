---
myst:
  html_meta:
    "description": "Configure Alertmanager email alerting in the cdk8s-monitoring stack: provide the SMTP block, keep the password in a secret, and address more than one recipient."
    "property=og:description": "Configure Alertmanager email alerting in the cdk8s-monitoring stack: provide the SMTP block, keep the password in a secret, and address more than one recipient."
    "property=og:title": "Configure SMTP alerting"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, SMTP, alerting, email"
---

# Configure SMTP alerting

This guide shows you how to set up email alerting through Alertmanager.
The stack renders the SMTP settings into the Alertmanager configuration from the `smtp` block you provide.

## Provide the SMTP block

Set the `smtp` block in your `mergeConfig` input.
The host, port, from address, and TLS flag are required.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  smtp: {
    host: 'in-v3.mailjet.com',
    port: 587,
    from: 'monitoring@example.net',
    username: 'monitoring@example.net',
    passwordSecret: { name: 'alertmanager-smtp', key: 'password' },
    recipients: ['ops@example.net', 'oncall@example.org'],
    requireTls: true,
  },
});
```

When you omit the username, the stack falls back to the from address for SMTP authentication.

```{important}
Write the host as a literal, or fail the build when it is missing.
A pattern such as `process.env.SMTP_HOST ?? 'mail.example.com'` turns a forgotten variable into a configuration that looks valid and silently delivers nothing.
```

## Keep the password in a secret

Point `passwordSecret` at a Secret in the monitoring namespace.
The stack then writes `smtp_auth_password_file` into the Alertmanager configuration and adds the secret to `alertmanagerSpec.secrets`, so Prometheus Operator mounts it at `/etc/alertmanager/secrets/<name>/<key>`.
The password never reaches the synthesized manifests.

Create the secret however you manage secrets; an External Secrets Operator `ExternalSecret` is the usual choice:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: alertmanager-smtp
  namespace: monitoring
spec:
  secretStoreRef:
    name: my-cluster-store
    kind: ClusterSecretStore
  target:
    name: alertmanager-smtp
  data:
  - secretKey: password
    remoteRef:
      key: smtp-credentials
      property: SMTP_PASSWORD
```

The `smtp.password` field still accepts a literal for compatibility.
It renders the password into the Alertmanager configuration in clear text, which means anything that commits the synthesized manifests commits the password with them.

```{warning}
Do not combine `password` with committed manifests.
Use `passwordSecret` instead; it takes precedence when both are set.
```

## Address more than one recipient

Alertmanager accepts several addresses per receiver, so list them in `recipients`:

```typescript
recipients: ['ops@example.net', 'oncall@example.org'],
```

A mail forwarding rule or distribution list is not required to reach more than one person.
Leave `recipients` unset to keep mailing the from address.

Prefer recipients outside the monitored cluster.
A mailbox hosted on the cluster the stack watches is unreachable in exactly the situation the alert describes.

## Verify

After deployment, check that Alertmanager started and loaded its configuration.

```shell
kubectl get pods -n monitoring -l app.kubernetes.io/name=alertmanager
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager
```

Delivery failures appear in that log rather than in the pod status, and Alertmanager stays `Ready` while none of its mail arrives:

```text
notify retry canceled after 16 attempts: establish connection to server:
  dial tcp: lookup mail.example.com: no such host
```

Trigger a test alert from Prometheus and confirm the message arrives at every configured recipient.
Check the spam folder on the first run, especially for recipients at large mail providers.

## See also

- {doc}`provide-config` — the integration chart that holds the SMTP block.
- {doc}`add-app-dashboards` — add `PrometheusRule` resources that fire these alerts.
