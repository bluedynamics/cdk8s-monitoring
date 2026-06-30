import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';

export interface TempoProps {
  namespace: string;
  config: MonitoringConfig;
  s3CredentialsSecretName: string;
}

/**
 * Creates the Grafana Tempo (monolithic) HelmChart for trace storage on S3.
 *
 * Single-binary Tempo backed by object storage, exposing an OTLP receiver that
 * the Alloy traces gateway forwards to. Block retention is enforced by Tempo's
 * compactor (config.tempo.retention).
 *
 * Sync Wave: 3 (advanced services, after core stack).
 */
export class TempoConstruct extends Construct {
  constructor(scope: Construct, id: string, props: TempoProps) {
    super(scope, id);

    const { namespace, config, s3CredentialsSecretName } = props;

    new ApiObject(this, 'tempo', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: 'tempo',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'tempo',
          'app.kubernetes.io/component': 'tracing',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        repo: 'https://grafana.github.io/helm-charts',
        chart: 'tempo',
        version: config.versions.tempo === 'latest' ? undefined : config.versions.tempo,
        targetNamespace: namespace,
        valuesContent: this.generateHelmValues(config, s3CredentialsSecretName),
      },
    });
  }

  private generateHelmValues(config: MonitoringConfig, s3CredentialsSecretName: string): string {
    // Values follow the monolithic grafana/tempo chart schema: storage,
    // receivers, resources, extraEnv live under `tempo:`; replicas/persistence/
    // tempoQuery are top-level. S3 credentials are NOT inlined into the config;
    // Tempo's S3 client picks up AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY from the
    // environment (set below from the ESO-synced secret) via the default chain.
    return `replicas: ${config.replicas.tempo}
tempo:
  retention: ${config.tempo.retention}
  # Soften the liveness probe: a single-binary Tempo serving expensive trace
  # searches can make /ready slow, and the chart default (timeout 5s,
  # failureThreshold 3) then SIGKILLs it under load. Readiness stays at the
  # chart default (sharp) so an overloaded instance is pulled from the Service
  # without being killed.
  livenessProbe:
    httpGet:
      path: /ready
      port: 3200
    initialDelaySeconds: 60
    periodSeconds: 30
    timeoutSeconds: 15
    failureThreshold: 6
    successThreshold: 1
  storage:
    trace:
      backend: s3
      s3:
        bucket: ${config.tempo.bucket}
        endpoint: ${config.s3.endpointNoProtocol}
        region: ${config.s3.region}
        forcepathstyle: false
        insecure: false
      wal:
        path: /var/tempo/wal
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: "0.0.0.0:4317"
        http:
          endpoint: "0.0.0.0:4318"
  resources:
    requests:
      cpu: ${config.resources.tempo.requests.cpu}
      memory: ${config.resources.tempo.requests.memory}
    limits:
      cpu: ${config.resources.tempo.limits.cpu}
      memory: ${config.resources.tempo.limits.memory}
  extraEnv:
    - name: AWS_ACCESS_KEY_ID
      valueFrom:
        secretKeyRef:
          name: ${s3CredentialsSecretName}
          key: AWS_ACCESS_KEY_ID
    - name: AWS_SECRET_ACCESS_KEY
      valueFrom:
        secretKeyRef:
          name: ${s3CredentialsSecretName}
          key: AWS_SECRET_ACCESS_KEY
persistence:
  enabled: true
  storageClassName: longhorn
  size: ${config.storage.tempo}
tempoQuery:
  enabled: false
`;
  }
}
