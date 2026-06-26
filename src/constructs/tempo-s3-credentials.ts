import { Construct } from 'constructs';
import {
  ExternalSecret,
  ExternalSecretSpecTargetCreationPolicy,
  ExternalSecretSpecSecretStoreRefKind,
} from '../imports/external-secrets.io';
import { MonitoringConfig } from '../types';

export interface TempoS3CredentialsProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates ExternalSecret for Tempo S3 credentials.
 *
 * Replicates the S3 credentials (same store/key as Loki and Thanos) into the
 * monitoring namespace for Tempo's object storage.
 *
 * Prerequisites:
 * - External Secrets Operator installed
 * - ClusterSecretStore named by config.integrations.s3SecretStore exists
 * - Source secret addressed by config.integrations.s3CredentialsKey exists in that store
 *
 * Generated Secret:
 * - Name: tempo-s3-credentials
 * - Keys: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * Sync Wave: 1 (external dependencies - must exist before Tempo starts)
 */
export class TempoS3CredentialsConstruct extends Construct {
  public readonly secretName = 'tempo-s3-credentials';

  constructor(scope: Construct, id: string, props: TempoS3CredentialsProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Create ExternalSecret that replicates S3 credentials
    // Wave 1: External Dependencies - credentials must exist before Tempo
    new ExternalSecret(this, 'tempo-s3-external-secret', {
      metadata: {
        name: 'tempo-s3-credentials-es',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'tempo',
          'app.kubernetes.io/component': 's3-credentials',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
        },
      },
      spec: {
        refreshInterval: '1h0m0s',
        secretStoreRef: {
          name: config.integrations.s3SecretStore,
          kind: ExternalSecretSpecSecretStoreRefKind.CLUSTER_SECRET_STORE,
        },
        target: {
          name: this.secretName,
          creationPolicy: ExternalSecretSpecTargetCreationPolicy.OWNER,
        },
        dataFrom: [
          {
            extract: {
              key: config.integrations.s3CredentialsKey,
            },
          },
        ],
      },
    });
  }
}
