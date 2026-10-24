import { Construct } from 'constructs';
import { KubePriorityClass } from '../imports/k8s';

/**
 * Creates the library's default `high-priority` PriorityClass (value 10000).
 *
 * It is the fallback for clusters without their own tiering; clusters that
 * bring their own classes disable it via config.priorityClasses.create.
 *
 * Sync Wave: 0 (foundation - must exist before pods reference it)
 */
export class PriorityClassConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create PriorityClass
    // Wave 0: Foundation - must exist before pods can reference it
    new KubePriorityClass(this, 'high-priority', {
      metadata: {
        name: 'high-priority',
        labels: {
          'app.kubernetes.io/name': 'high-priority',
          'app.kubernetes.io/component': 'scheduling',
          'app.kubernetes.io/managed-by': 'cdk8s',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '0',
        },
      },
      value: 10000,
      globalDefault: false,
      description: 'Use this class for high-priority pods only.',
    });
  }
}
