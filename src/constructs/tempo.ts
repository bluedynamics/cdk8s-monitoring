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
    return `tempo:
  retention: ${config.tempo.retention}
  storage:
    trace:
      backend: s3
      s3:
        bucket: ${config.tempo.bucket}
        endpoint: ${config.s3.endpointNoProtocol}
        region: ${config.s3.region}
        forcepathstyle: false
        access_key: \${AWS_ACCESS_KEY_ID}
        secret_key: \${AWS_SECRET_ACCESS_KEY}
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
tempoQuery:
  enabled: false
replicas: ${config.replicas.tempo}
extraArgs:
  - -config.expand-env=true
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
resources:
  requests:
    cpu: ${config.resources.tempo.requests.cpu}
    memory: ${config.resources.tempo.requests.memory}
  limits:
    cpu: ${config.resources.tempo.limits.cpu}
    memory: ${config.resources.tempo.limits.memory}
`;
  }
}
