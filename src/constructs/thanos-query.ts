import { Construct } from 'constructs';
import { KubeDeployment, KubeService, Quantity, IntOrString } from '../imports/k8s';
import { MonitoringConfig } from '../types';

export interface ThanosQueryProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates Thanos Query Deployment and Services.
 *
 * Thanos Query provides a unified query interface for:
 * - Local Prometheus data (3-day retention)
 * - Historical S3 data (via Thanos Store Gateway)
 * - Automatic deduplication across Prometheus replicas
 *
 * Components:
 * - Deployment (2 replicas with anti-affinity)
 * - HTTP Service (port 9090 for Grafana queries)
 * - gRPC Service (headless, for future Query Frontend)
 *
 * Prerequisites:
 * - Namespace exists
 * - PriorityClass 'high-priority' exists
 * - Prometheus with Thanos sidecar running
 * - Thanos Store Gateway running
 *
 * Sync Wave: 3 (query layer - after Prometheus and Store)
 */
export class ThanosQueryConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ThanosQueryProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Create Deployment
    // Wave 3: Query Layer - after Prometheus and Store are ready
    new KubeDeployment(this, 'deployment', {
      metadata: {
        name: 'thanos-query',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-query',
          'app.kubernetes.io/component': 'query',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        replicas: config.replicas.thanosQuery,
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'thanos-query',
          },
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'thanos-query',
              'app.kubernetes.io/component': 'query',
            },
          },
          spec: {
            // No arch nodeSelector: Thanos images are multi-arch; let the
            // scheduler place these on any worker (legacy ARM64 pin removed).

            // Spread replicas across different nodes for HA
            affinity: {
              podAntiAffinity: {
                preferredDuringSchedulingIgnoredDuringExecution: [
                  {
                    weight: 100,
                    podAffinityTerm: {
                      labelSelector: {
                        matchLabels: {
                          'app.kubernetes.io/name': 'thanos-query',
                        },
                      },
                      topologyKey: 'kubernetes.io/hostname',
                    },
                  },
                ],
              },
            },

            containers: [
              {
                name: 'thanos-query',
                image: `quay.io/thanos/thanos:${config.versions.thanos}`,
                args: [
                  'query',
                  '--log.level=info',
                  '--query.replica-label=replica',
                  '--query.replica-label=prometheus_replica',
                  // Connect to Prometheus sidecars via gRPC.
                  // The sidecar gRPC port is exposed by the operator's thanos
                  // discovery service (thanosService.enabled=true), NOT by
                  // prometheus-operated (which only exposes http-web:9090).
                  `--endpoint=dnssrv+_grpc._tcp.kube-prometheus-stack-thanos-discovery.${namespace}.svc.cluster.local`,
                  // Connect to Thanos Store Gateway
                  `--endpoint=dnssrv+_grpc._tcp.thanos-store-grpc.${namespace}.svc.cluster.local`,
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
                livenessProbe: {
                  httpGet: {
                    path: '/-/healthy',
                    port: IntOrString.fromNumber(10902), // HTTP port (named 'http' in ports list)
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 30,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/-/ready',
                    port: IntOrString.fromNumber(10902), // HTTP port (named 'http' in ports list)
                  },
                  initialDelaySeconds: 15,
                  periodSeconds: 5,
                },
                resources: {
                  requests: {
                    cpu: Quantity.fromString(config.resources.thanosQuery.requests.cpu),
                    memory: Quantity.fromString(config.resources.thanosQuery.requests.memory),
                  },
                  limits: {
                    cpu: Quantity.fromString(config.resources.thanosQuery.limits.cpu),
                    memory: Quantity.fromString(config.resources.thanosQuery.limits.memory),
                  },
                },
              },
            ],

            priorityClassName: 'high-priority',
          },
        },
      },
    });

    // Create HTTP Service (for Grafana)
    new KubeService(this, 'service-http', {
      metadata: {
        name: 'thanos-query',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-query',
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
            port: 9090,
            // Container http port is 10902. A bare string is dropped by cdk8s
            // (targetPort expects IntOrString), which silently defaulted
            // targetPort to 9090 and made the Service refuse connections.
            targetPort: IntOrString.fromString('http'),
            protocol: 'TCP',
          },
        ],
        selector: {
          'app.kubernetes.io/name': 'thanos-query',
        },
        sessionAffinity: 'ClientIP',
      },
    });

    // Create gRPC Service (headless, for future Query Frontend)
    new KubeService(this, 'service-grpc', {
      metadata: {
        name: 'thanos-query-grpc',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'thanos-query',
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
            targetPort: IntOrString.fromString('grpc'),
            protocol: 'TCP',
          },
        ],
        selector: {
          'app.kubernetes.io/name': 'thanos-query',
        },
      },
    });
  }
}
