import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';

export interface LokiProps {
  namespace: string;
  config: MonitoringConfig;
  s3CredentialsSecretName: string;
}

/**
 * Creates Loki HelmChart for log aggregation.
 *
 * This construct deploys Loki in SimpleScalable mode with:
 * - Backend (2 replicas) - Index and compaction
 * - Read (2 replicas) - Query processing
 * - Write (2 replicas) - Log ingestion
 * - Gateway (1 replica) - HTTP API endpoint
 * - S3 storage backend (Hetzner Object Storage)
 *
 * Prerequisites:
 * - Namespace exists
 * - PriorityClass 'high-priority' exists
 * - Longhorn storage class available
 * - S3 bucket exists (via Crossplane)
 * - S3 credentials secret exists (via LokiS3CredentialsConstruct)
 *
 * Sync Wave: 2 (core services - after S3 credentials secret)
 */
export class LokiConstruct extends Construct {
  constructor(scope: Construct, id: string, props: LokiProps) {
    super(scope, id);

    const { namespace, config, s3CredentialsSecretName } = props;

    // Generate Helm values YAML
    const helmValues = this.generateHelmValues(config, s3CredentialsSecretName);

    // Create HelmChart resource (K3S Helm controller)
    // Wave 2: Core Services - log aggregation
    new ApiObject(this, 'loki', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: 'loki',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'loki',
          'app.kubernetes.io/component': 'logging',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '2',
        },
      },
      spec: {
        repo: 'https://grafana.github.io/helm-charts',
        chart: 'loki',
        version: config.versions.loki === 'latest' ? undefined : config.versions.loki,
        targetNamespace: namespace,
        valuesContent: helmValues,
      },
    });
  }

  private generateHelmValues(
    config: MonitoringConfig,
    s3CredentialsSecretName: string,
  ): string {
    // S3 credentials are injected via environment variables from a Kubernetes secret
    // The secret is created by LokiS3CredentialsConstruct using ExternalSecrets
    // Loki expands environment variables in config when -config.expand-env=true is set

    return `deploymentMode: SimpleScalable

loki:
  auth_enabled: false

  schemaConfig:
    configs:
      - from: 2024-01-01
        store: tsdb
        object_store: s3
        schema: v13
        index:
          prefix: loki_index_
          period: 24h

  storage:
    bucketNames:
      chunks: ${config.s3.buckets.loki}
      ruler: ${config.s3.buckets.loki}
    type: s3
    s3:
      endpoint: ${config.s3.endpoint}
      region: auto  # Dummy region for Hetzner S3 (endpoint determines actual location)
      # Credentials are expanded from environment variables at runtime
      secretAccessKey: \${AWS_SECRET_ACCESS_KEY}
      accessKeyId: \${AWS_ACCESS_KEY_ID}
      s3ForcePathStyle: false
      insecure: false

  limits_config:
    allow_structured_metadata: true
    max_streams_per_user: 100000
    ingestion_rate_mb: 10
    ingestion_burst_size_mb: 20
    retention_period: ${config.retention.loki}
    reject_old_samples: true
    reject_old_samples_max_age: 168h

  compactor:
    retention_enabled: true
    delete_request_store: s3

backend:
  replicas: ${config.replicas.lokiBackend}
  extraArgs:
    - "-config.expand-env=true"
  extraEnvFrom:
    - secretRef:
        name: ${s3CredentialsSecretName}
  resources:
    limits:
      cpu: ${config.resources.lokiBackend.limits.cpu}
      memory: ${config.resources.lokiBackend.limits.memory}
    requests:
      cpu: ${config.resources.lokiBackend.requests.cpu}
      memory: ${config.resources.lokiBackend.requests.memory}
  persistence:
    enabled: true
    storageClass: longhorn
    size: ${config.storage.lokiBackend}
  priorityClassName: high-priority

read:
  replicas: ${config.replicas.lokiRead}
  extraArgs:
    - "-config.expand-env=true"
  extraEnvFrom:
    - secretRef:
        name: ${s3CredentialsSecretName}
  resources:
    limits:
      cpu: ${config.resources.lokiRead.limits.cpu}
      memory: ${config.resources.lokiRead.limits.memory}
    requests:
      cpu: ${config.resources.lokiRead.requests.cpu}
      memory: ${config.resources.lokiRead.requests.memory}
  priorityClassName: high-priority

write:
  replicas: ${config.replicas.lokiWrite}
  extraArgs:
    - "-config.expand-env=true"
  extraEnvFrom:
    - secretRef:
        name: ${s3CredentialsSecretName}
  resources:
    limits:
      cpu: ${config.resources.lokiWrite.limits.cpu}
      memory: ${config.resources.lokiWrite.limits.memory}
    requests:
      cpu: ${config.resources.lokiWrite.requests.cpu}
      memory: ${config.resources.lokiWrite.requests.memory}
  persistence:
    enabled: true
    storageClass: longhorn
    size: ${config.storage.lokiWrite}
  priorityClassName: high-priority

gateway:
  enabled: true
  replicas: ${config.replicas.grafana}
  resources:
    limits:
      cpu: ${config.resources.lokiGateway.limits.cpu}
      memory: ${config.resources.lokiGateway.limits.memory}
    requests:
      cpu: ${config.resources.lokiGateway.requests.cpu}
      memory: ${config.resources.lokiGateway.requests.memory}
  priorityClassName: high-priority

minio:
  enabled: false

# Disable memcached caches to reduce memory footprint
# Memcached is an optimization for high query loads, not required for small clusters
chunksCache:
  enabled: false
resultsCache:
  enabled: false
`;
  }
}
