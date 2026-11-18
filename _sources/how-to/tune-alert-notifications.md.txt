---
myst:
  html_meta:
    "description": "Make cdk8s-monitoring alert mails link to browser-reachable URLs, change how often firing alerts repeat, and add mail headers for your relay."
    "property=og:description": "Make cdk8s-monitoring alert mails link to browser-reachable URLs, change how often firing alerts repeat, and add mail headers for your relay."
    "property=og:title": "Tune alert notifications"
    "keywords": "cdk8s, Kubernetes, monitoring, Alertmanager, notifications, externalUrl, repeat_interval, mail headers"
---

# Tune alert notifications

This guide shows you how to adjust the alert mails once delivery works.
You fix the links in the mails, change how often a firing alert repeats, and add mail headers for your relay.
To set up delivery first, see {doc}`configure-smtp-alerting`.

## Make the links in the mails open

Every notification links to Alertmanager, and every alert links to the Prometheus expression that fired it.
By default, both links point at in-cluster Service addresses that no browser can open.

Set `externalUrls` to the addresses under which you reach Alertmanager and Prometheus.
A Thanos Query in front of Prometheus understands the same `/graph` links, so you can point `prometheus` at it.

```typescript
const config = mergeConfig({
  // required cluster values ...
  externalUrls: {
    alertmanager: 'https://alertmanager.example.com',
    prometheus: 'https://metrics.example.com',
  },
});
```

The setting changes only the links.
The pods keep serving under the path `/`, so you do not need to change your ingress or proxy.

## Change how often a firing alert repeats

Alertmanager mails a still-firing alert group again after `alertRouting.repeatInterval`, which defaults to `12h`.
Lower it if an alert must not go unnoticed overnight, or raise it if long-standing alerts flood the mailbox.

```typescript
const config = mergeConfig({
  // required cluster values ...
  alertRouting: { repeatInterval: '4h' },
});
```

The interval does not delay changes.
A new group goes out after 30 seconds, and a new or resolved alert in an existing group goes out after the group interval of five minutes.

## Add mail headers

Some relays rewrite links for click tracking or insert tracking pixels.
A rewritten link breaks the Alertmanager and Prometheus links in the mail.
Most relays accept a header that turns this off for a single message.

Add the headers to `smtp.headers`.
The stack passes the names through as given.

```typescript
const config = mergeConfig({
  // required cluster values ...
  smtp: {
    host: 'in-v3.mailjet.com',
    port: 587,
    from: 'monitoring@example.net',
    username: 'relay-api-key',
    passwordSecret: { name: 'alertmanager-smtp', key: 'password' },
    requireTls: true,
    headers: {
      'X-Mailjet-TrackClick': '0',
      'X-Mailjet-TrackOpen': '0',
    },
  },
});
```

The headers go on every notification, including those of the `staging` receiver.

## Verify

Synthesize and deploy your integration chart, then wait for the next notification or trigger a test alert.
Check that both links in the mail open in your browser, and that the link targets are not rewritten to a tracking domain.

To read the configuration that Alertmanager loaded, query its status endpoint.

```shell
kubectl port-forward -n monitoring svc/kube-prometheus-stack-alertmanager 9093:9093
curl -s http://localhost:9093/api/v2/status | jq -r .config.original
```

## See also

- {doc}`../reference/alerts-and-routing` — the complete routing tree and receivers.
- {doc}`../reference/configuration-options` — the `externalUrls`, `alertRouting`, and `smtp` fields.
- {doc}`route-staging-alerts` — demote alerts from staging namespaces.
