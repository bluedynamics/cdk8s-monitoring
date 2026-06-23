import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { BucketLifecycleConfiguration, BucketLifecycleConfigurationSpecManagementPolicies } from '../imports/s3.aws.upbound.io';
import { MonitoringConfig } from '../types';

export interface LokiS3BucketProps {
  config: MonitoringConfig;
}

/**
 * Creates Crossplane Bucket resources for Loki log storage.
 *
 * This construct generates:
 * - S3 Bucket (via Crossplane Upbound provider-aws-s3)
 * - BucketVersioning (for recovery of accidentally deleted logs)
 * - BucketLifecycleConfiguration (90-day retention)
 *
 * Prerequisites:
 * - Crossplane operator installed
 * - Upbound provider-aws-s3 installed
 * - ProviderConfig 'hetzner-s3' configured (points to Hetzner S3)
 * - Hetzner S3 credentials secret exists in crossplane-system
 *
 * Sync Wave: 1 (external dependencies - must exist before pods access S3)
 */
export class LokiS3BucketConstruct extends Construct {
  constructor(scope: Construct, id: string, props: LokiS3BucketProps) {
    super(scope, id);

    const { config } = props;
    const bucketName = config.s3.buckets.loki;
    const region = config.s3.region;

    // Create Bucket
    // Wave 1: External Dependencies - S3 bucket provisioned by Crossplane
    // Note: Using ApiObject because cdk8s import limitations prevent importing Bucket type
    new ApiObject(this, 'bucket', {
      apiVersion: 's3.aws.upbound.io/v1beta2',
      kind: 'Bucket',
      metadata: {
        name: bucketName,
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'loki',
          'app.kubernetes.io/component': 'storage',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
          'crossplane.io/external-name': bucketName,
          'description': 'Loki log storage (90-day retention)',
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
          name: 'hetzner-s3',
        },
      },
    });

    // Create BucketVersioning
    // Enable versioning for recovery of accidentally deleted logs
    // Note: Using ApiObject because cdk8s import limitations prevent importing BucketVersioning type
    new ApiObject(this, 'versioning', {
      apiVersion: 's3.aws.upbound.io/v1beta2',
      kind: 'BucketVersioning',
      metadata: {
        name: 'loki-logs-versioning',
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'loki',
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
          region: region, // Production region (same as bucket)
          bucketRef: {
            name: bucketName,
          },
          versioningConfiguration: {
            status: 'Enabled',
          },
        },
        providerConfigRef: {
          name: 'hetzner-s3',
        },
      },
    });

    // Create BucketLifecycleConfiguration
    // Lifecycle policy: automatically delete logs older than 90 days
    new BucketLifecycleConfiguration(this, 'lifecycle', {
      metadata: {
        name: 'loki-logs-lifecycle',
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'loki',
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
          region: region, // Production region (same as bucket)
          bucketRef: {
            name: bucketName,
          },
          rule: [
            {
              id: 'delete-old-logs',
              status: 'Enabled',
              expiration: [
                {
                  days: 90, // 90-day retention (matches 31d Loki retention + buffer)
                },
              ],
            },
          ],
        },
        providerConfigRef: {
          name: 'hetzner-s3',
        },
      },
    });
  }
}
