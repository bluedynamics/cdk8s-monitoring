import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';

export interface AlloyProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates Alloy (Grafana Agent) HelmChart for log collection.
 *
 * This construct deploys Alloy as a DaemonSet that:
 * - Runs on every node in the cluster
 * - Collects logs from all pods via Kubernetes API
 * - Parses JSON structured logs
 * - Extracts structured metadata (trace_id, request_id, etc.)
 * - Tags logs with cluster=kup6s label
 * - Forwards logs to Loki gateway
 *
 * Prerequisites:
 * - Namespace exists
 * - PriorityClass 'high-priority' exists
 * - Loki gateway service exists
 * - RBAC permissions for pod log access
 *
 * Sync Wave: 3 (log collection - after Loki is ready)
 */
export class AlloyConstruct extends Construct {
  constructor(scope: Construct, id: string, props: AlloyProps) {
    super(scope, id);

    const { namespace, config } = props;

    // Generate Helm values YAML with embedded Alloy configuration
    const helmValues = this.generateHelmValues(config);

    // Create HelmChart resource (K3S Helm controller)
    // Wave 3: Log Collection - after Loki is ready
    new ApiObject(this, 'alloy', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: 'alloy',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'alloy',
          'app.kubernetes.io/component': 'log-collector',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
        },
        annotations: {
          'argocd.argoproj.io/sync-wave': '3',
        },
      },
      spec: {
        repo: 'https://grafana.github.io/helm-charts',
        chart: 'alloy',
        version: config.versions.alloy === 'latest' ? undefined : config.versions.alloy,
        targetNamespace: namespace,
        valuesContent: helmValues,
      },
    });
  }

  private generateHelmValues(config: MonitoringConfig): string {
    // Alloy configuration is written in Alloy's HCL-like syntax
    // This is embedded in the Helm values as a multi-line string
    return `controller:
  type: daemonset

alloy:
  configMap:
    create: true
    content: |-
      logging {
        level  = "info"
        format = "logfmt"
      }

      discovery.kubernetes "pods" {
        role = "pod"
        selectors {
          role  = "pod"
          field = "spec.nodeName=" + sys.env("HOSTNAME")
        }
      }

      // __meta_kubernetes_* labels live on discovery targets only —
      // loki.source.kubernetes does not propagate them to log streams.
      // Relabel here so namespace/pod/container/etc become real labels.
      discovery.relabel "pod_logs" {
        targets = discovery.kubernetes.pods.targets

        // Skip terminally Failed pods and Unknown-state pods.
        // Old crashed pods otherwise pin loki.source.kubernetes in a
        // retry loop, blocking it from tailing the running replica.
        // CrashLoopBackOff pods stay phase=Running — we keep tailing those.
        rule {
          source_labels = ["__meta_kubernetes_pod_phase"]
          regex         = "Failed|Unknown"
          action        = "drop"
        }

        rule {
          source_labels = ["__meta_kubernetes_namespace"]
          target_label  = "namespace"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_name"]
          target_label  = "pod"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_container_name"]
          target_label  = "container"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_label_app"]
          target_label  = "app"
        }

        rule {
          source_labels = ["__meta_kubernetes_pod_label_app_kubernetes_io_component"]
          target_label  = "component"
        }
      }

      loki.source.kubernetes "pods" {
        targets    = discovery.relabel.pod_logs.output
        forward_to = [loki.process.logs.receiver]
      }

      loki.process "logs" {
        forward_to = [loki.write.default.receiver]

        stage.json {
          expressions = {
            timestamp    = "timestamp",
            level        = "level",
            event        = "event",
            component    = "component",
            connector_id = "connector_id",
            user_id      = "user_id",
            request_id   = "request_id",
            trace_id     = "trace_id",
            kafka        = "kafka",
          }
        }

        stage.labels {
          values = {
            level = "level",
          }
        }

        stage.structured_metadata {
          values = {
            connector_id = "connector_id",
            user_id      = "user_id",
            request_id   = "request_id",
            trace_id     = "trace_id",
          }
        }

        stage.timestamp {
          source = "timestamp"
          format = "RFC3339"
        }

        stage.output {
          source = "event"
        }
      }

      loki.write "default" {
        endpoint {
          url = "http://loki-gateway.${config.namespace}.svc.cluster.local/loki/api/v1/push"
        }
        external_labels = {
          cluster = "kup6s",
        }
      }

  extraEnv:
    - name: HOSTNAME
      valueFrom:
        fieldRef:
          fieldPath: spec.nodeName

resources:
  limits:
    cpu: ${config.resources.alloy.limits.cpu}
    memory: ${config.resources.alloy.limits.memory}
  requests:
    cpu: ${config.resources.alloy.requests.cpu}
    memory: ${config.resources.alloy.requests.memory}

# Config-reloader sidecar resources (added 2025-11-18)
configReloader:
  resources:
    limits:
      cpu: ${config.resources.configReloader.limits.cpu}
      memory: ${config.resources.configReloader.limits.memory}
    requests:
      cpu: ${config.resources.configReloader.requests.cpu}
      memory: ${config.resources.configReloader.requests.memory}

rbac:
  create: true

serviceAccount:
  create: true

priorityClassName: high-priority
`;
  }
}
