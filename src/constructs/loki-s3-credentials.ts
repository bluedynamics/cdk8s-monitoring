import { Construct } from 'constructs';
import {
  ExternalSecret,
  ExternalSecretSpecTargetCreationPolicy,
  ExternalSecretSpecSecretStoreRefKind,
} from '../imports/external-secrets.io';
import { MonitoringConfig } from '../types';

export interface LokiS3CredentialsProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates ExternalSecret for Loki S3 credentials.
 *
 * This construct replicates Hetzner S3 credentials from crossplane-system
 * namespace to monitoring namespace for Loki's object storage.
 *
 * Prerequisites:
 * - External Secrets Operator installed
 * - ClusterSecretStore 'hetzner-s3-cluster-store' exists (points to crossplane-system)
 * - Secret 'hetzner-s3-creds-standard' exists in crossplane-system namespace
 *
 * Generated Secret:
 * - Name: loki-s3-credentials
 * - Keys: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * Sync Wave: 1 (external dependencies - must exist before Loki starts)
 */
export class LokiS3CredentialsConstruct extends Construct {
  public readonly secretName = 'loki-s3-credentials';

  constructor(scope: Construct, id: string, props: LokiS3CredentialsProps) {
    super(scope, id);

    const { namespace } = props;

    // Create ExternalSecret that replicates S3 credentials
    // Wave 1: External Dependencies - credentials must exist before Loki components
    new ExternalSecret(this, 'loki-s3-external-secret', {
      metadata: {
        name: 'loki-s3-credentials-es',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'loki',
          'app.kubernetes.io/component': 's3-credentials',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
        },
      },
      spec: {
        // Refresh credentials every hour (automatic rotation support)
        // Use full format to match Kubernetes normalization and avoid ArgoCD drift
        refreshInterval: '1h0m0s',

        // Use existing ClusterSecretStore for Hetzner S3 (infrastructure-level secrets)
        secretStoreRef: {
          name: 'hetzner-s3-cluster-store',
          kind: ExternalSecretSpecSecretStoreRefKind.CLUSTER_SECRET_STORE,
        },

        // Target secret that Loki will consume via extraEnvFrom
        target: {
          name: this.secretName,
          creationPolicy: ExternalSecretSpecTargetCreationPolicy.OWNER,
        },

        // Fetch S3 credentials from crossplane-system/hetzner-s3-creds-standard
        dataFrom: [
          {
            extract: {
              key: 'hetzner-s3-creds-standard',
            },
          },
        ],
      },
    });
  }
}
