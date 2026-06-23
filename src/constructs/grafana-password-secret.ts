import { Construct } from 'constructs';
import {
  ExternalSecret,
  ExternalSecretSpecTargetCreationPolicy,
  ExternalSecretSpecSecretStoreRefKind,
} from '../imports/external-secrets.io';
import { MonitoringConfig } from '../types';

export interface GrafanaPasswordSecretProps {
  readonly namespace: string;
  readonly config: MonitoringConfig;
}

/**
 * Creates ExternalSecret for stable Grafana admin credentials.
 *
 * This construct creates an ExternalSecret that replicates the Grafana admin password
 * from the application-secrets namespace to the monitoring namespace, following the
 * centralized secret management pattern.
 *
 * Prerequisites:
 * - External Secrets Operator installed
 * - ClusterSecretStore named by config.integrations.grafanaSecretStore exists
 * - The source secret addressed by config.integrations.grafanaCredentialsKey exists with keys:
 *   - admin-user
 *   - admin-password
 *
 * Security Model:
 * - Source secret stored in centralized application-secrets namespace
 * - ExternalSecret CR (this) committed to git (GitOps-safe, no password in git)
 * - ESO automatically replicates secret to monitoring namespace
 * - Password persists across Helm upgrades (no auto-regeneration)
 *
 * Benefits:
 * - Centralized secret management (all app secrets in application-secrets namespace)
 * - GitOps-safe (ExternalSecret in git, actual password not in git)
 * - Password rotation (update source → auto-sync to monitoring)
 * - Follows GitLab BDA security model (see documentation/sources/deployments/gitlabbda/explanation/security-model.md)
 *
 * Usage in prometheus-stack.ts:
 * ```yaml
 * grafana:
 *   admin:
 *     existingSecret: "grafana-admin-credentials"
 *     userKey: "admin-user"
 *     passwordKey: "admin-password"
 * ```
 *
 * Manual Setup Required:
 * 1. Create source secret in application-secrets namespace:
 *    ```bash
 *    kubectl create secret generic grafana-admin -n application-secrets \
 *      --from-literal=admin-user=admin \
 *      --from-literal=admin-password='YourSecurePassword123!'
 *    ```
 *
 * 2. Create ClusterSecretStore (if not exists):
 *    See: documentation/sources/deployments/monitoring/how-to/setup-grafana-password.md
 *
 * 3. Deploy monitoring stack (this ExternalSecret will sync the secret)
 */
export class GrafanaPasswordSecret extends Construct {
  public readonly externalSecret: ExternalSecret;

  constructor(scope: Construct, id: string, props: GrafanaPasswordSecretProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Create ExternalSecret to replicate Grafana credentials from application-secrets
    // Wave 1: Credentials must exist before Grafana starts (Wave 2)
    this.externalSecret = new ExternalSecret(this, 'external-secret', {
      metadata: {
        name: 'grafana-admin-credentials-es',
        namespace,
        labels: {
          'app.kubernetes.io/name': 'grafana',
          'app.kubernetes.io/component': 'credentials',
          'app.kubernetes.io/managed-by': 'external-secrets',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '1',
        },
      },
      spec: {
        // Sync every hour to detect password rotation
        refreshInterval: '1h',

        // Reference to ClusterSecretStore (application-secrets → monitoring)
        secretStoreRef: {
          name: config.integrations.grafanaSecretStore,
          kind: ExternalSecretSpecSecretStoreRefKind.CLUSTER_SECRET_STORE,
        },

        // Target secret name that Grafana will use
        target: {
          name: 'grafana-admin-credentials',
          creationPolicy: ExternalSecretSpecTargetCreationPolicy.OWNER,
        },

        // Copy all data from source secret (admin-user, admin-password)
        dataFrom: [
          {
            extract: {
              key: config.integrations.grafanaCredentialsKey,
            },
          },
        ],
      },
    });
  }
}
