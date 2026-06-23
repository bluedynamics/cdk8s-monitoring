import { Construct } from 'constructs';
import { KubeStatefulSet, KubeService, Quantity, IntOrString } from '../imports/k8s';
import { MonitoringConfig } from '../types';

export interface ThanosCompactorProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates Thanos Compactor StatefulSet and Service.
 *
 * Thanos Compactor performs:
 * - Downsampling: Creates 5-minute and 1-hour resolution data from raw blocks
 * - Compaction: Merges small blocks into larger ones for better query performance
 * - Retention enforcement: Deletes blocks older than configured retention
 *
 * Retention Strategy:
 * - Raw (15s resolution): 30 days
 * - 5-minute resolution: 180 days (6 months)
 * - 1-hour resolution: 730 days (2 years)
 *
 * Components:
 * - StatefulSet (1 replica - singleton, 20Gi PVC for working directory)
 * - HTTP Service (for metrics and debugging)
 *
 * Prerequisites:
 * - Namespace exists
 * - PriorityClass 'high-priority' exists
 * - Longhorn storage class available
 * - Thanos S3 secret exists (thanos-objstore-config)
 * - S3 bucket contains Prometheus data blocks
 *
 * Sync Wave: 3 (compaction - can run alongside Store Gateway)
 */
export class ThanosCompactorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ThanosCompactorProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Create StatefulSet
    // Wave 3: Compaction - after S3 bucket and credentials are ready
    new KubeStatefulSet(this, 'statefulset', {
      metadata: {
        name: 'thanos-compactor',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-compactor',
          'app.kubernetes.io/component': 'compactor',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        serviceName: 'thanos-compactor',
        replicas: 1, // Singleton - only one compactor should run
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'thanos-compactor',
          },
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'thanos-compactor',
              'app.kubernetes.io/component': 'compactor',
            },
          },
          spec: {
            // No arch nodeSelector: Thanos images are multi-arch; let the
            // scheduler place this on any worker (legacy ARM64 pin removed).

            // Fix volume permissions for Thanos user (UID 10001)
            securityContext: {
              fsGroup: 10001,
              runAsUser: 10001,
              runAsNonRoot: true,
            },

            containers: [
              {
                name: 'thanos-compactor',
                image: `quay.io/thanos/thanos:${config.versions.thanos}`,
                args: [
                  'compact',
                  '--log.level=info',
                  '--data-dir=/var/thanos/compactor',
                  '--objstore.config-file=/etc/thanos/objstore.yml',
                  '--wait', // Wait for other compactors to finish (prevents conflicts)
                  // Downsampling configuration
                  `--retention.resolution-raw=${config.retention.prometheusS3Raw}d`, // Keep raw data for 30 days
                  `--retention.resolution-5m=${config.retention.prometheusS35m}d`, // Keep 5m data for 180 days (6 months)
                  `--retention.resolution-1h=${config.retention.prometheusS31h}d`, // Keep 1h data for 730 days (2 years)
                  // Compaction configuration
                  '--compact.concurrency=1',
                  '--delete-delay=48h', // Wait 48h before deleting blocks (safety margin)
                ],
                ports: [
                  {
                    name: 'http',
                    containerPort: 10902,
                  },
                ],
                volumeMounts: [
                  {
                    name: 'objstore-config',
                    mountPath: '/etc/thanos',
                    readOnly: true,
                  },
                  {
                    name: 'data',
                    mountPath: '/var/thanos/compactor',
                  },
                ],
                livenessProbe: {
                  httpGet: {
                    path: '/-/healthy',
                    port: IntOrString.fromString('http'),
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 30,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/-/ready',
                    port: IntOrString.fromString('http'),
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 5,
                },
                resources: {
                  requests: {
                    cpu: Quantity.fromString(config.resources.thanosCompactor.requests.cpu),
                    memory: Quantity.fromString(config.resources.thanosCompactor.requests.memory),
                  },
                  limits: {
                    cpu: Quantity.fromString(config.resources.thanosCompactor.limits.cpu),
                    memory: Quantity.fromString(config.resources.thanosCompactor.limits.memory),
                  },
                },
              },
            ],

            volumes: [
              {
                name: 'objstore-config',
                secret: {
                  secretName: 'thanos-objstore-config',
                },
              },
            ],

            priorityClassName: 'high-priority',
          },
        },
        volumeClaimTemplates: [
          {
            metadata: {
              name: 'data',
            },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'longhorn',
              resources: {
                requests: {
                  storage: Quantity.fromString(config.storage.thanosCompactor), // Working directory for compaction operations
                },
              },
            },
          },
        ],
      },
    });

    // Create HTTP Service (for metrics/debugging)
    new KubeService(this, 'service', {
      metadata: {
        name: 'thanos-compactor',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-compactor',
          'app.kubernetes.io/managed-by': 'cdk8s',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        ports: [
          {
            name: 'http',
            port: 10902,
            targetPort: 'http' as any,
            protocol: 'TCP',
          },
        ],
        selector: {
          'app.kubernetes.io/name': 'thanos-compactor',
        },
      },
    });
  }
}
