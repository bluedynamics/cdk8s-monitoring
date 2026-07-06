import { Construct } from 'constructs';
import { TRAEFIK_DASHBOARD } from '../dashboards/traefik-dashboard';
import { KubeConfigMap } from '../imports/k8s';
import { PodMonitor } from '../imports/monitoring.coreos.com';
import { TraefikConfig } from '../types';

export interface TraefikMonitorProps {
  /** Namespace the monitoring stack lives in (where the PodMonitor/ConfigMap go). */
  readonly monitoringNamespace: string;
  /** Traefik config (namespace it runs in + dashboard toggle). */
  readonly traefik: TraefikConfig;
}

/**
 * Generic, opt-in monitor for a Traefik ingress controller.
 *
 * Uses a PodMonitor (not a ServiceMonitor): the k3s-bundled Traefik Service only
 * exposes web/websecure; the `metrics` port is on the Pod, not the Service.
 *
 * Optionally ships the Traefik Grafana dashboard as a ConfigMap (grafana_dashboard
 * label → sidecar auto-discovery). Enabled via config.traefik in MonitoringChart.
 */
export class TraefikMonitorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: TraefikMonitorProps) {
    super(scope, id);
    const { monitoringNamespace, traefik } = props;

    new PodMonitor(this, 'traefik-metrics', {
      metadata: {
        name: 'traefik-metrics',
        namespace: monitoringNamespace,
        labels: {
          'app.kubernetes.io/name': 'traefik',
          'app.kubernetes.io/component': 'ingress-controller',
          'app.kubernetes.io/managed-by': 'cdk8s',
          'app.kubernetes.io/part-of': 'monitoring',
          'release': 'kube-prometheus-stack',
        },
      },
      spec: {
        selector: { matchLabels: { 'app.kubernetes.io/name': 'traefik' } },
        namespaceSelector: { matchNames: [traefik.namespace] },
        podMetricsEndpoints: [
          { port: 'metrics', path: '/metrics', interval: '30s', scrapeTimeout: '10s' },
        ],
      },
    });

    if (traefik.dashboard) {
      new KubeConfigMap(this, 'traefik-dashboard', {
        metadata: {
          name: 'traefik-dashboard',
          namespace: monitoringNamespace,
          labels: {
            'grafana_dashboard': '1',
            'app.kubernetes.io/name': 'traefik',
            'app.kubernetes.io/component': 'dashboard',
            'app.kubernetes.io/managed-by': 'cdk8s',
            'app.kubernetes.io/part-of': 'monitoring',
          },
        },
        data: { 'traefik.json': JSON.stringify(TRAEFIK_DASHBOARD) },
      });
    }
  }
}
