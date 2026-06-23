---
myst:
  html_meta:
    "description": "Configure S3 object storage for the cdk8s-monitoring stack: Crossplane buckets for Thanos and Loki, and External Secrets that replicate credentials into the monitoring namespace."
    "property=og:description": "Configure S3 object storage for the cdk8s-monitoring stack: Crossplane buckets for Thanos and Loki, and External Secrets that replicate credentials into the monitoring namespace."
    "property=og:title": "Configure S3 credentials"
    "keywords": "cdk8s, Kubernetes, monitoring, S3, Crossplane, External Secrets, Thanos, Loki"
---

# Configure S3 credentials

This guide shows you how to supply the object storage configuration the stack needs for Thanos metrics and Loki logs.
The library creates the buckets through Crossplane and replicates the credentials through External Secrets Operator, but it relies on cluster-level resources you provide.

## Provide the S3 block

Set the `s3` block in your `mergeConfig` input.
Both endpoint forms are required: the full URL for Loki, and the host-only form for the Thanos object store config.

```typescript
const config = mergeConfig({
  // other required cluster values ...
  s3: {
    endpoint: 'https://fsn1.your-objectstorage.com',
    endpointNoProtocol: 'fsn1.your-objectstorage.com',
    region: 'fsn1',
    buckets: { thanos: 'metrics-thanos-prod', loki: 'logs-loki-prod' },
  },
});
```

## What the library creates

From this block the stack synthesizes:

- A Crossplane `Bucket` for Thanos and one for Loki, both in the `crossplane-system` namespace, with versioning and lifecycle rules.
- A Thanos `ExternalSecret` that reads the source credentials and renders a `thanos-objstore-config` secret with an `objstore.yml` key.
- A Loki `ExternalSecret` that renders a `loki-s3-credentials` secret with `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## Provide the cluster-level resources

The synthesized resources expect these to already exist.

The Crossplane provider config and credentials
:   The `Bucket` resources are reconciled by Crossplane in `crossplane-system`.
    A `ProviderConfig` and its credentials secret must point at your S3 endpoint.

The S3 `ClusterSecretStore`
:   Both `ExternalSecret`s reference a store named `hetzner-s3-cluster-store`.
    Create that store and point it at the namespace holding the source credentials.

The source credentials secret
:   Both `ExternalSecret`s extract from a source secret named `hetzner-s3-creds-standard`.
    That secret must hold `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

```{important}
The credential names, `hetzner-s3-cluster-store` and `hetzner-s3-creds-standard`, are fixed in the library.
Create the store and source secret under exactly those names, or the External Secrets will fail to resolve.
```

## Verify

After deployment, confirm the buckets reconciled and the secrets materialized.

```shell
kubectl get buckets.s3.aws.upbound.io -n crossplane-system
kubectl get externalsecrets -n monitoring
kubectl get secret thanos-objstore-config loki-s3-credentials -n monitoring
```

## See also

- {doc}`setup-prerequisites` — install Crossplane and External Secrets Operator.
- {doc}`../explanation/architecture` — how Thanos and Loki use object storage.
