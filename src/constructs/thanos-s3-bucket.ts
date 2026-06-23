import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { BucketLifecycleConfiguration, BucketLifecycleConfigurationSpecManagementPolicies } from '../imports/s3.aws.upbound.io';
import { MonitoringConfig } from '../types';

export interface ThanosS3BucketProps {
  config: MonitoringConfig;
}

/**
 * Creates Crossplane Bucket resources for Thanos long-term metrics storage.
 *
 * This construct generates:
 * - S3 Bucket (via Crossplane Upbound provider-aws-s3)
 * - BucketVersioning (for recovery)
 * - BucketLifecycleConfiguration (2-year retention)
 *
 * Prerequisites:
 * - Crossplane operator installed
 * - Upbound provider-aws-s3 installed
 * - Crossplane ProviderConfig named by config.integrations.s3ProviderConfig exists
 * - Hetzner S3 credentials secret exists in crossplane-system
 *
 * Sync Wave: 1 (external dependencies - must exist before pods access S3)
 */
export class ThanosS3BucketConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ThanosS3BucketProps) {
    super(scope, id);

    const { config } = props;
    const bucketName = config.s3.buckets.thanos;
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
          'app.kubernetes.io/name': 'thanos',
          'app.kubernetes.io/component': 'storage',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
          'crossplane.io/external-name': bucketName,
          'description': 'Thanos long-term metrics storage (2-year retention)',
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
    // Enable versioning for bucket recovery
    // Note: Using ApiObject because cdk8s import limitations prevent importing BucketVersioning type
    new ApiObject(this, 'versioning', {
      apiVersion: 's3.aws.upbound.io/v1beta2',
      kind: 'BucketVersioning',
      metadata: {
        name: 'thanos-metrics-versioning',
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'thanos',
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
          name: config.integrations.s3ProviderConfig,
        },
      },
    });

    // Create BucketLifecycleConfiguration
    // Lifecycle policy: Delete downsampled blocks after 2 years (cost control)
    new BucketLifecycleConfiguration(this, 'lifecycle', {
      metadata: {
        name: 'thanos-metrics-lifecycle',
        namespace: 'crossplane-system',
        labels: {
          'app.kubernetes.io/name': 'thanos',
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
              id: 'expire-old-blocks',
              status: 'Enabled',
              expiration: [
                {
                  days: config.retention.prometheusS31h, // 730 days (2 years) retention
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
