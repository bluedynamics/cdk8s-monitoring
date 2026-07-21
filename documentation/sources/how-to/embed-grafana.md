---
myst:
  html_meta:
    "description": "Allow another web application to embed Grafana in an iframe: set embedding.enabled and embedding.frameAncestors, then verify the response headers."
    "property=og:description": "Allow another web application to embed Grafana in an iframe: set embedding.enabled and embedding.frameAncestors, then verify the response headers."
    "property=og:title": "Embed Grafana in another application"
    "keywords": "cdk8s, Kubernetes, monitoring, Grafana, iframe, embedding, CSP, frame-ancestors"
---

# Embed Grafana in another application

This guide shows you how to let another web application load Grafana inside an `<iframe>`.
Embedding is opt-in; with the default configuration Grafana refuses to be framed at all.

Use it when a portal or console has to show a Grafana dashboard in place, including an externally shared dashboard, which is served from the same Grafana instance and therefore hits the same restriction.

```{warning}
Embedding is an instance-wide setting.
It applies to the authenticated Grafana UI as much as to a shared dashboard, so name only origins you control.
```

## Collect the embedding origins

List every origin whose pages will frame Grafana.
An origin is scheme plus host, without a path, for example `https://console.example.com`.

Each distinct hostname is its own origin.
An application served from both `console.example.com` and `manager.example.com` needs both entries, otherwise the second one is blocked.

## Enable embedding

Set `embedding.enabled` to `true` and list the origins in `embedding.frameAncestors` in the `mergeConfig` input.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  embedding: {
    enabled: true,
    frameAncestors: [
      'https://console.example.com',
      'https://manager.example.com',
    ],
  },
});
```

This adds a `[security]` section to `grafana.ini` that turns off `X-Frame-Options`, turns on the Content-Security-Policy header, and sets a policy whose `frame-ancestors` directive lists `'self'` plus your origins.
Grafana's own origin stays allowed, so its internal panel previews keep working.

`embedding.frameAncestors` is required whenever `embedding.enabled` is true.
If you enable embedding without an origin, `mergeConfig` throws `embedding.frameAncestors must name at least one origin when embedding.enabled is true`.

## Deploy and verify

Roll out the chart, then confirm Grafana picked up the section.

```shell
kubectl exec -n monitoring deploy/kube-prometheus-stack-grafana -c grafana -- cat /etc/grafana/grafana.ini
```

Check the response headers of the Grafana host.
`X-Frame-Options` must be gone and `Content-Security-Policy` must carry your origins.

```shell
curl -sI https://grafana.example.com/login | grep -i -E 'x-frame-options|content-security-policy'
```

Finally, open a page of the embedding application and confirm the iframe renders.
A browser that blocks the frame reports the offending directive in the developer console.

## Keep the ingress out of the way

The header must survive the path from Grafana to the browser.
If your ingress controller injects its own `X-Frame-Options` or `Content-Security-Policy`, the browser sees that instead and the frame stays blocked.
Remove any such security-header middleware from the Grafana ingress, or extend it with the same `frame-ancestors` value.

## See also

- {doc}`../reference/configuration-options` — every `embedding` field and its default.
- {doc}`override-defaults` — how the merge of defaults and overrides works.
