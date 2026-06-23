import { Construct } from 'constructs';
import { KubeNamespace } from '../imports/k8s';

export interface NamespaceProps {
  name: string;
}

/**
 * Creates the monitoring namespace with proper labels and ArgoCD sync-wave annotation.
 *
 * Sync Wave: 0 (foundation - must exist before any other resources)
 */
export class NamespaceConstruct extends Construct {
  public readonly name: string;

  constructor(scope: Construct, id: string, props: NamespaceProps) {
    super(scope, id);

    this.name = props.name;

    // Create namespace
    // Wave 0: Foundation - must exist before any other resources
    new KubeNamespace(this, 'namespace', {
      metadata: {
        name: props.name,
        annotations: {
          'argocd.argoproj.io/sync-wave': '0',
        },
        labels: {
          'name': props.name,
          'app.kubernetes.io/name': 'monitoring',
          'app.kubernetes.io/component': 'observability',
          'app.kubernetes.io/managed-by': 'cdk8s',
        },
      },
    });
  }
}
