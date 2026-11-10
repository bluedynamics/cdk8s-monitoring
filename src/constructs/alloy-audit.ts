import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import { MonitoringConfig } from '../types';
import { HELM_CHART_FAILURE_POLICY } from './helm-chart';

export interface AlloyAuditProps {
  namespace: string;
  config: MonitoringConfig;
}

/**
 * Ships the Kubernetes API audit log from the control planes to Loki.
 *
 * A second Alloy DaemonSet, `alloy-audit`, runs only on the control planes
 * (nodeSelector + taint tolerations), tails the audit files the API server writes
 * to `config.auditLog.path` and sends them to the Loki gateway with the labels
 * `job=k3s-audit`, `node` and `cluster`. Verb, user, resource and namespace of
 * each event become structured metadata, the JSON line stays intact. The same
 * fields plus the response code feed the Prometheus counter
 * `loki_process_custom_k3s_audit_events_total`, scraped through a ServiceMonitor,
 * so alert rules and dashboards can work on identities without touching Loki.
 *
 * The API server creates the files as root with mode 0600, so the container runs
 * as uid 0 and, for SELinux hosts, as `spc_t`; it drops every capability and has
 * no Kubernetes API access. Read positions live on the host so a restart does not
 * re-ingest the files.
 *
 * Opt-in through `config.auditLog.enabled`. Sync Wave: 3 (after Loki).
 */
export class AlloyAuditConstruct extends Construct {
  constructor(scope: Construct, id: string, props: AlloyAuditProps) {
    super(scope, id);

    const { namespace, config } = props;

    new ApiObject(this, 'alloy-audit', {
      apiVersion: 'helm.cattle.io/v1',
      kind: 'HelmChart',
      metadata: {
        name: 'alloy-audit',
        namespace: namespace,
        labels: {
          'app.kubernetes.io/name': 'alloy-audit',
          'app.kubernetes.io/component': 'audit-log-collector',
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
        failurePolicy: HELM_CHART_FAILURE_POLICY,
        valuesContent: this.generateHelmValues(config),
      },
    });
  }

  private generateHelmValues(config: MonitoringConfig): string {
    const { path, nodeSelector } = config.auditLog;
    const positionsPath = '/var/lib/alloy-audit';
    const nodeSelectorYaml = Object.entries(nodeSelector)
      .map(([key, value]) => `    ${key}: "${value}"`)
      .join('\n');
    return `controller:
  type: daemonset
  priorityClassName: ${config.priorityClasses.capture}
  nodeSelector:
${nodeSelectorYaml}
  tolerations:
    - key: node-role.kubernetes.io/control-plane
      operator: Exists
    - key: node-role.kubernetes.io/master
      operator: Exists
  volumes:
    extra:
      - name: audit-log
        hostPath:
          path: ${path}
          type: Directory
      - name: positions
        hostPath:
          path: ${positionsPath}
          type: DirectoryOrCreate
alloy:
  # The API server writes the audit files as root with mode 0600. On SELinux hosts
  # (openSUSE MicroOS) container_t may not write the hostPath for the positions, so
  # the container runs as a super privileged container type; capabilities stay dropped.
  securityContext:
    runAsUser: 0
    runAsGroup: 0
    seLinuxOptions:
      type: spc_t
    allowPrivilegeEscalation: false
    capabilities:
      drop:
        - ALL
  storagePath: ${positionsPath}
  mounts:
    extra:
      - name: audit-log
        mountPath: ${path}
        readOnly: true
      - name: positions
        mountPath: ${positionsPath}
  configMap:
    create: true
    content: |-
      logging {
        level  = "info"
        format = "logfmt"
      }

      local.file_match "audit" {
        path_targets = [{
          __path__ = "${path}/*.log",
          job      = "k3s-audit",
          node     = sys.env("HOSTNAME"),
        }]
      }

      loki.source.file "audit" {
        targets    = local.file_match.audit.targets
        forward_to = [loki.process.audit.receiver]
      }

      loki.process "audit" {
        forward_to = [loki.write.default.receiver]

        stage.json {
          expressions = {
            ts        = "stageTimestamp",
            verb      = "verb",
            user      = "user.username",
            resource  = "objectRef.resource",
            namespace = "objectRef.namespace",
            code      = "responseStatus.code",
          }
        }

        // Counter for Prometheus: who touched what, how often, with which result.
        // The labels exist only while counting and are dropped again before the
        // line goes to Loki, so the streams stay low-cardinality.
        stage.labels {
          values = {
            verb      = "verb",
            user      = "user",
            resource  = "resource",
            namespace = "namespace",
            code      = "code",
          }
        }

        stage.metrics {
          metric.counter {
            name        = "k3s_audit_events_total"
            description = "Kubernetes API audit events by identity, verb, resource, namespace and response code"
            match_all   = true
            action      = "inc"
          }
        }

        stage.label_drop {
          values = ["verb", "user", "resource", "namespace", "code"]
        }

        stage.structured_metadata {
          values = {
            verb      = "verb",
            user      = "user",
            resource  = "resource",
            namespace = "namespace",
          }
        }

        stage.timestamp {
          source = "ts"
          format = "RFC3339Nano"
        }
      }

      loki.write "default" {
        endpoint {
          url = "http://loki-gateway.${config.namespace}.svc.cluster.local/loki/api/v1/push"
        }
        external_labels = {
          cluster = "${config.clusterName}",
        }
      }
resources:
  requests:
    cpu: ${config.resources.alloyAudit.requests.cpu}
    memory: ${config.resources.alloyAudit.requests.memory}
  limits:
    cpu: ${config.resources.alloyAudit.limits.cpu}
    memory: ${config.resources.alloyAudit.limits.memory}
configReloader:
  resources:
    requests:
      cpu: ${config.resources.configReloader.requests.cpu}
      memory: ${config.resources.configReloader.requests.memory}
    limits:
      cpu: ${config.resources.configReloader.limits.cpu}
      memory: ${config.resources.configReloader.limits.memory}
# Prometheus scrapes the audit counters (loki_process_custom_k3s_audit_events_total).
serviceMonitor:
  enabled: true
  additionalLabels:
    release: kube-prometheus-stack
# The collector reads files only; it needs no Kubernetes API access.
rbac:
  create: false
serviceAccount:
  create: true
`;
  }
}
