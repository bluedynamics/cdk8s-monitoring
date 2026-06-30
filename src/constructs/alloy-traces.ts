import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';

export interface AlloyTracesProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Creates a dedicated Alloy deployment as the OTLP traces gateway.
 *
 * Apps send OTLP (gRPC 4317 / HTTP 4318) to the `alloy-traces` service. This
 * single-replica gateway tail-samples (all errors + slow traces + a probabilistic
 * remainder) and exports to Tempo's OTLP distributor. One replica guarantees a
 * single instance sees all spans of a trace, which tail-sampling requires.
 *
 * Sync Wave: 3 (advanced services, alongside Tempo).
 */
export class AlloyTracesConstruct extends Construct {
  constructor(scope: Construct, id: string, props: AlloyTracesProps) {
    super(scope, id);

    const { namespace, config } = props;

    new ApiObject(this, 'alloy-traces', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: 'alloy-traces',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'alloy-traces',
          'app.kubernetes.io/component': 'trace-collector',
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
        valuesContent: this.generateHelmValues(config),
      },
    });
  }

  private generateHelmValues(config: MonitoringConfig): string {
    const ts = config.tempo.tailSampling;
    // The probabilistic policy keeps a percentage of the traces that no other
    // policy matched (i.e. fast, non-error traces). Omit it entirely when set to
    // 0 so those traces are dropped instead of leaking a fraction to Tempo.
    const probabilisticPolicy = ts.probabilisticPercent > 0 ? `

        policy {
          name = "rest"
          type = "probabilistic"
          probabilistic { sampling_percentage = ${ts.probabilisticPercent} }
        }` : '';
    return `controller:
  type: deployment
  replicas: 1
alloy:
  extraPorts:
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
      protocol: TCP
    - name: otlp-http
      port: 4318
      targetPort: 4318
      protocol: TCP
  configMap:
    content: |-
      otelcol.receiver.otlp "default" {
        grpc { endpoint = "0.0.0.0:4317" }
        http { endpoint = "0.0.0.0:4318" }
        output { traces = [otelcol.processor.tail_sampling.default.input] }
      }

      otelcol.processor.tail_sampling "default" {
        decision_wait = "10s"

        policy {
          name = "errors"
          type = "status_code"
          status_code { status_codes = ["ERROR"] }
        }

        policy {
          name = "slow"
          type = "latency"
          latency { threshold_ms = ${ts.latencyThresholdMs} }
        }${probabilisticPolicy}

        output { traces = [otelcol.exporter.otlp.tempo.input] }
      }

      otelcol.exporter.otlp "tempo" {
        client {
          endpoint = "tempo.${config.namespace}.svc.cluster.local:4317"
          tls { insecure = true }
        }
      }
resources:
  requests:
    cpu: ${config.resources.alloyTraces.requests.cpu}
    memory: ${config.resources.alloyTraces.requests.memory}
  limits:
    cpu: ${config.resources.alloyTraces.limits.cpu}
    memory: ${config.resources.alloyTraces.limits.memory}
`;
  }
}
