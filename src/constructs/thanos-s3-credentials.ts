import { Construct } from 'constructs';
import {
  ExternalSecret,
  ExternalSecretSpecTargetCreationPolicy,
  ExternalSecretSpecTargetTemplateEngineVersion,
  ExternalSecretSpecSecretStoreRefKind,
} from '../imports/external-secrets.io';
import { MonitoringConfig } from '../types';

export interface ThanosS3CredentialsProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates ExternalSecret for Thanos S3 credentials.
 *
 * This construct replicates Hetzner S3 credentials from crossplane-system
 * namespace to monitoring namespace and transforms them into Thanos objstore.yml format.
 *
 * Prerequisites:
 * - External Secrets Operator installed
 * - ClusterSecretStore 'hetzner-s3-cluster-store' exists (points to crossplane-system)
 * - Secret 'hetzner-s3-creds-standard' exists in crossplane-system namespace
 *
 * Generated Secret:
 * - Name: thanos-objstore-config
 * - Key: objstore.yml
 * - Format: Thanos object storage configuration YAML
 *
 * Sync Wave: 1 (external dependencies - must exist before Thanos components start)
 */
export class ThanosS3CredentialsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ThanosS3CredentialsProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Create ExternalSecret that replicates S3 credentials
    // Wave 1: External Dependencies - credentials must exist before Thanos components
    new ExternalSecret(this, 'thanos-s3-external-secret', {
      metadata: {
        name: 'thanos-s3-credentials-es',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos',
          'app.kubernetes.io/component': 'objstore-config',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
        },
      },
      spec: {
        // Refresh credentials every hour (automatic rotation support)
        refreshInterval: '1h',

        // Use existing ClusterSecretStore for Hetzner S3 (infrastructure-level secrets)
        secretStoreRef: {
          name: 'hetzner-s3-cluster-store',
          kind: ExternalSecretSpecSecretStoreRefKind.CLUSTER_SECRET_STORE,
        },

        // Target secret that Thanos sidecar will consume
        target: {
          name: 'thanos-objstore-config',
          creationPolicy: ExternalSecretSpecTargetCreationPolicy.OWNER,

          // Transform AWS credential format into Thanos objstore.yml
          template: {
            engineVersion: ExternalSecretSpecTargetTemplateEngineVersion.V2,
            data: {
              'objstore.yml': `type: S3
config:
  bucket: "${config.s3.buckets.thanos}"
  endpoint: "${config.s3.endpointNoProtocol}"
  region: ${config.s3.region}
  access_key: {{ .AWS_ACCESS_KEY_ID }}
  secret_key: {{ .AWS_SECRET_ACCESS_KEY }}
  insecure: false
  signature_version2: false
  http_config:
    idle_conn_timeout: 90s
    response_header_timeout: 2m
    insecure_skip_verify: false
  trace:
    enable: false
  part_size: 67108864  # 64MB upload chunks
`,
            },
          },
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
