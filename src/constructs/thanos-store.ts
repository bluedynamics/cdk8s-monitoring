import { Construct } from 'constructs';
import { KubeStatefulSet, KubeService, Quantity, IntOrString } from '../imports/k8s';
import { MonitoringConfig } from '../types';

export interface ThanosStoreProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates Thanos Store Gateway StatefulSet and Services.
 *
 * Thanos Store Gateway queries historical data from S3 and makes it
 * available via gRPC to Thanos Query. This enables transparent querying
 * of metrics older than the Prometheus local retention (>3 days).
 *
 * Components:
 * - StatefulSet (2 replicas with anti-affinity, 10Gi PVC each for index cache)
 * - gRPC Service (headless, for Thanos Query discovery)
 * - HTTP Service (for debugging and metrics)
 *
 * Prerequisites:
 * - Namespace exists
 * - PriorityClass 'high-priority' exists
 * - Longhorn storage class available
 * - Thanos S3 secret exists (thanos-objstore-config)
 * - S3 bucket contains Prometheus data blocks
 *
 * Sync Wave: 3 (storage gateway - after S3 bucket and credentials)
 */
export class ThanosStoreConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ThanosStoreProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Create StatefulSet
    // Wave 3: Storage Gateway - after S3 bucket and credentials are ready
    new KubeStatefulSet(this, 'statefulset', {
      metadata: {
        name: 'thanos-store',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-store',
          'app.kubernetes.io/component': 'store-gateway',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        serviceName: 'thanos-store',
        replicas: config.replicas.thanosStore,
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'thanos-store',
          },
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'thanos-store',
              'app.kubernetes.io/component': 'store-gateway',
            },
          },
          spec: {
            // No arch nodeSelector: Thanos images are multi-arch; let the
            // scheduler place these on any worker (the ARM64 pin was a legacy
            // placement onto the cax31 agent pool, now being retired → EX).

            // Spread replicas across different nodes for HA
            affinity: {
              podAntiAffinity: {
                preferredDuringSchedulingIgnoredDuringExecution: [
                  {
                    weight: 100,
                    podAffinityTerm: {
                      labelSelector: {
                        matchLabels: {
                          'app.kubernetes.io/name': 'thanos-store',
                        },
                      },
                      topologyKey: 'kubernetes.io/hostname',
                    },
                  },
                ],
              },
            },

            // Fix volume permissions for Thanos user (UID 10001)
            securityContext: {
              fsGroup: 10001,
              runAsUser: 10001,
              runAsNonRoot: true,
            },

            containers: [
              {
                name: 'thanos-store',
                image: `quay.io/thanos/thanos:${config.versions.thanos}`,
                args: [
                  'store',
                  '--log.level=info',
                  '--data-dir=/var/thanos/store',
                  '--objstore.config-file=/etc/thanos/objstore.yml',
                  '--index-cache-size=500MB',
                  '--chunk-pool-size=500MB',
                ],
                ports: [
                  {
                    name: 'http',
                    containerPort: 10902,
                  },
                  {
                    name: 'grpc',
                    containerPort: 10901,
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
                    mountPath: '/var/thanos/store',
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
                    cpu: Quantity.fromString(config.resources.thanosStore.requests.cpu),
                    memory: Quantity.fromString(config.resources.thanosStore.requests.memory),
                  },
                  limits: {
                    cpu: Quantity.fromString(config.resources.thanosStore.limits.cpu),
                    memory: Quantity.fromString(config.resources.thanosStore.limits.memory),
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
                  storage: Quantity.fromString(config.storage.thanosStore), // Cache for S3 index data
                },
              },
            },
          },
        ],
      },
    });

    // Create gRPC Service (headless, for Thanos Query to discover)
    new KubeService(this, 'service-grpc', {
      metadata: {
        name: 'thanos-store-grpc',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-store',
          'app.kubernetes.io/managed-by': 'cdk8s',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        type: 'ClusterIP',
        clusterIp: 'None', // Headless service for DNS-based discovery
        ports: [
          {
            name: 'grpc',
            port: 10901,
            targetPort: 'grpc' as any,
            protocol: 'TCP',
          },
        ],
        selector: {
          'app.kubernetes.io/name': 'thanos-store',
        },
      },
    });

    // Create HTTP Service (for debugging/metrics)
    new KubeService(this, 'service-http', {
      metadata: {
        name: 'thanos-store-http',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-store',
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
          'app.kubernetes.io/name': 'thanos-store',
        },
      },
    });
  }
}
