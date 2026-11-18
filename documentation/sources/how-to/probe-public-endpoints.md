---
myst:
  html_meta:
    "description": "Probe public URLs and TLS ports with the opt-in blackbox exporter of cdk8s-monitoring and alert on outages and expiring certificates."
    "property=og:description": "Probe public URLs and TLS ports with the opt-in blackbox exporter of cdk8s-monitoring and alert on outages and expiring certificates."
    "property=og:title": "Probe public endpoints"
    "keywords": "cdk8s, Kubernetes, monitoring, blackbox exporter, Probe, uptime, certificate expiry"
---

# Probe public endpoints

This guide shows you how to probe the public URLs and TLS ports of your cluster with a blackbox exporter, and alert when one stops answering or its certificate is about to expire.
The probes see every certificate an endpoint serves, also those that cert-manager does not manage.

The blackbox probes are opt-in.
With the default configuration, no exporter and no probe exist.

## Choose the targets

List one URL per application or site, not every alias that redirects to it.
A probe of `https://example.com/` follows redirects and expects a `2xx` answer with a valid certificate.
List ports that speak no HTTP, such as IMAPS or SMTPS, as `host:port`; their probe only completes a TLS handshake.
Leave out staging, scaled-down, and login-only endpoints, because a probe that fails by design trains everyone to ignore the alert.

## Enable the probes

Set `blackbox.enabled` and the targets in your `mergeConfig` input.

```typescript
const config = mergeConfig({
  // required cluster values ...
  blackbox: {
    enabled: true,
    httpTargets: ['https://example.com/', 'https://shop.example.com/'],
    tlsTargets: ['mail.example.com:993', 'mail.example.com:465'],
  },
});
```

`mergeConfig` refuses an enabled block without any target.
To warn earlier or later about expiring certificates, set `certWarningDays`, `14` by default.
If you manage the probe alerts yourself, set `alerts: false` to keep only the exporter and the probes.

The probes run from inside the cluster.
A request to the cluster's own load balancer address can be short-cut by the CNI, so the probes check routing, the application, and the certificate, but not the external load balancer or DNS.

## Synthesize and deploy

Synthesize your integration chart and deploy it the way you deploy the rest of the stack.

```shell
npx cdk8s synth
```

## Verify the probes

Check that the exporter runs and the probes exist:

```shell
kubectl get deploy,probe -n monitoring | grep blackbox
```

Then query Prometheus or Thanos for the results.
Every target must report `probe_success` `1`:

```promql
probe_success == 0
```

An empty result means every probe succeeds.
For a failing target, query the exporter directly to see why:

```shell
kubectl port-forward -n monitoring svc/blackbox-exporter 9115:9115
curl 'http://localhost:9115/probe?module=http_2xx&target=https://example.com/&debug=true'
```

## See also

- {doc}`../reference/configuration-options` — the `blackbox` fields.
- {doc}`../reference/alerts-and-routing` — the blackbox alerts and their inhibition rules.
