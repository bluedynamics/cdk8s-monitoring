---
myst:
  html_meta:
    "description": "Configure Alertmanager email alerting in the cdk8s-monitoring stack: provide the SMTP block and inject the password at synth time."
    "property=og:description": "Configure Alertmanager email alerting in the cdk8s-monitoring stack: provide the SMTP block and inject the password at synth time."
    "property=og:title": "Configure SMTP alerting"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, SMTP, alerting, email"
---

# Configure SMTP alerting

This guide shows you how to set up email alerting through Alertmanager.
The stack renders the SMTP settings into the Alertmanager configuration from the `smtp` block you provide.

## Provide the SMTP block

Set the `smtp` block in your `mergeConfig` input.
The host, port, from address, and TLS flag are required; the username and password are optional.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  smtp: {
    host: process.env.SMTP_HOST!,
    port: 587,
    from: 'monitoring@example.net',
    username: 'monitoring@example.net',
    password: process.env.SMTP_PASSWORD,
    requireTls: true,
  },
});
```

The from address doubles as the default alert recipient.
When you omit the username, the stack falls back to the from address for SMTP authentication.

## Keep the password out of git

Inject the SMTP password through the environment at synth time, as shown above, rather than committing it.
The value lands in the synthesized Alertmanager configuration, so treat the synthesized manifests as sensitive and store them accordingly.

```{warning}
The SMTP password is rendered into the Alertmanager configuration at synth time.
Never commit the password to your source repository, and restrict access to the synthesized manifests.
```

## Verify

After deployment, check that Alertmanager started and loaded its configuration.

```shell
kubectl get pods -n monitoring -l app.kubernetes.io/name=alertmanager
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager
```

Trigger a test alert from Prometheus and confirm the message arrives at the from address.

## See also

- {doc}`provide-config` — the integration chart that holds the SMTP block.
- {doc}`add-app-dashboards` — add `PrometheusRule` resources that fire these alerts.
