import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { BucketLifecycleConfiguration, BucketLifecycleConfigurationSpecManagementPolicies } from '../imports/s3.aws.upbound.io';
import { MonitoringConfig } from '../types';

export interface TempoS3BucketProps {
  config: MonitoringConfig;
}

/**
 * Creates Crossplane Bucket resources for Tempo trace storage.
 *
 * This construct generates:
 * - S3 Bucket (via Crossplane Upbound provider-aws-s3)
 * - BucketVersioning (for recovery of accidentally deleted blocks)
 * - BucketLifecycleConfiguration (retention buffer)
 *
 * Prerequisites:
 * - Crossplane operator installed
 * - Upbound provider-aws-s3 installed
 * - Crossplane ProviderConfig named by config.integrations.s3ProviderConfig exists
 * - Hetzner S3 credentials secret exists in crossplane-system
 *
 * Sync Wave: 1 (external dependencies - must exist before pods access S3)
 */
export class TempoS3BucketConstruct extends Construct {
  constructor(scope: Construct, id: string, props: TempoS3BucketProps) {
    super(scope, id);

    const { config } = props;
    const bucketName = config.tempo.bucket;
    const region = config.s3.region;

    // Create Bucket
    // Wave 1: External Dependencies - S3 bucket provisioned by Crossplane
    new ApiObject(this, 'bucket', {
      apiVersion: 's3.aws.upbound.io/v1beta2',
      kind: 'Bucket',
      metadata: {
        name: bucketName,
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'tempo',
          'app.kubernetes.io/component': 'storage',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
          'crossplane.io/external-name': bucketName,
          'description': 'Tempo trace storage',
        },
      },
      spec: {
        deletionPolicy: 'Delete',
        managementPolicies: [
          'Observe',
          'Create',
          'Delete',
          // Skip Update to avoid tagging operations (not supported by Hetzner S3)
        ],
        forProvider: {
          region: region, // Production region (endpoint determines actual location)
        },
        providerConfigRef: {
          name: config.integrations.s3ProviderConfig,
        },
      },
    });

    // Create BucketVersioning
    new ApiObject(this, 'versioning', {
      apiVersion: 's3.aws.upbound.io/v1beta2',
      kind: 'BucketVersioning',
      metadata: {
        name: 'tempo-traces-versioning',
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'tempo',
          'app.kubernetes.io/component': 'storage',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
        },
      },
      spec: {
        forProvider: {
          region: region,
          bucketRef: {
            name: bucketName,
          },
          versioningConfiguration: {
            status: 'Enabled',
          },
        },
        providerConfigRef: {
          name: config.integrations.s3ProviderConfig,
        },
      },
    });

    // Create BucketLifecycleConfiguration
    // Lifecycle policy: delete trace blocks older than the buffer window.
    // Tempo's own compactor enforces tempo.retention; this is a storage-side safety net.
    new BucketLifecycleConfiguration(this, 'lifecycle', {
      metadata: {
        name: 'tempo-traces-lifecycle',
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'tempo',
          'app.kubernetes.io/component': 'storage',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
        },
      },
      spec: {
        managementPolicies: [
          BucketLifecycleConfigurationSpecManagementPolicies.OBSERVE,
          BucketLifecycleConfigurationSpecManagementPolicies.CREATE,
          BucketLifecycleConfigurationSpecManagementPolicies.DELETE,
        ],
        forProvider: {
          region: region,
          bucketRef: {
            name: bucketName,
          },
          rule: [
            {
              id: 'delete-old-traces',
              status: 'Enabled',
              expiration: [
                {
                  days: 30, // storage-side safety net beyond Tempo's block retention
                },
              ],
            },
          ],
        },
        providerConfigRef: {
          name: config.integrations.s3ProviderConfig,
        },
      },
    });
  }
}
