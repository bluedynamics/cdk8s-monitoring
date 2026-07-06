import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

// Import all constructs
import { AlloyConstruct } from './constructs/alloy';
import { AlloyTracesConstruct } from './constructs/alloy-traces';
import { GrafanaPasswordSecret } from './constructs/grafana-password-secret';
import { LokiConstruct } from './constructs/loki';
import { LokiS3BucketConstruct } from './constructs/loki-s3-bucket';
import { LokiS3CredentialsConstruct } from './constructs/loki-s3-credentials';
import { LonghornMonitorConstruct } from './constructs/longhorn-monitor';
import { NamespaceConstruct } from './constructs/namespace';
import { PriorityClassConstruct } from './constructs/priority-class';
import { PrometheusStackConstruct } from './constructs/prometheus-stack';
import { TempoConstruct } from './constructs/tempo';
import { TempoS3BucketConstruct } from './constructs/tempo-s3-bucket';
import { TempoS3CredentialsConstruct } from './constructs/tempo-s3-credentials';
import { ThanosCompactorConstruct } from './constructs/thanos-compactor';
import { ThanosQueryConstruct } from './constructs/thanos-query';
import { ThanosS3BucketConstruct } from './constructs/thanos-s3-bucket';
import { ThanosS3CredentialsConstruct } from './constructs/thanos-s3-credentials';
import { ThanosStoreConstruct } from './constructs/thanos-store';
import { TraefikMonitorConstruct } from './constructs/traefik-monitor';
import { MonitoringConfig } from './types';

/**
 * MonitoringChart orchestrates the complete monitoring stack.
 *
 * This chart creates all resources in the correct order using ArgoCD sync-waves:
 *
 * Wave 0: Foundation
 * - Namespace
 * - PriorityClass
 *
 * Wave 1: External Dependencies
 * - S3 Buckets (Crossplane)
 * - S3 Credentials (ExternalSecret)
 *
 * Wave 2: Core Services
 * - Prometheus Stack (Prometheus, Grafana, Alertmanager)
 * - Loki (log aggregation)
 *
 * Wave 3: Advanced Services
 * - Alloy (log collection)
 * - Thanos Query (unified metrics query)
 * - Thanos Store (S3 gateway)
 * - Thanos Compactor (downsampling)
 *
 * Cluster- and application-specific dashboards and alert rules are intentionally
 * NOT part of this chart. Integration charts attach their own dashboard/alert
 * constructs beside this one (the Grafana sidecar discovers ConfigMaps labeled
 * `grafana_dashboard: "1"` in the same namespace).
 *
 * Exception: monitors for GENERIC infrastructure components that ship with the
 * stack's environment (Traefik ingress, Longhorn storage) are available as
 * opt-in, off-by-default constructs here (config.traefik / config.longhorn), so
 * every consumer can enable them without re-implementing the same scrape/alert
 * specs. They stay disabled unless explicitly turned on.
 *
 * Configuration is provided via the MonitoringConfig interface, which combines:
 * - config.yaml (default values)
 * - Environment variables (overrides)
 */
export class MonitoringChart extends Chart {
  constructor(scope: Construct, id: string, readonly config: MonitoringConfig, props: ChartProps = {}) {
    super(scope, id, props);

    const namespace = config.namespace;

    // =========================================================================
    // Wave 0: Foundation
    // =========================================================================
    // Must exist before any other resources
    new NamespaceConstruct(this, 'namespace', {
      name: namespace,
    });

    new PriorityClassConstruct(this, 'priority-class');

    // =========================================================================
    // Wave 1: External Dependencies
    // =========================================================================
    // S3 buckets must be created before pods try to access them
    new ThanosS3BucketConstruct(this, 'thanos-s3-bucket', {
      config,
    });

    new LokiS3BucketConstruct(this, 'loki-s3-bucket', {
      config,
    });

    // Secrets must exist before pods mount them
    new ThanosS3CredentialsConstruct(this, 'thanos-s3-credentials', {
      namespace,
      config,
    });

    const lokiS3Credentials = new LokiS3CredentialsConstruct(this, 'loki-s3-credentials', {
      namespace,
      config,
    });

    // Grafana admin credentials (stable password across Helm upgrades)
    new GrafanaPasswordSecret(this, 'grafana-password', {
      namespace,
      config,
    });

    // =========================================================================
    // Wave 2: Core Services
    // =========================================================================
    // Prometheus Stack (includes Prometheus, Grafana, Alertmanager, operators)
    new PrometheusStackConstruct(this, 'prometheus-stack', {
      namespace,
      config,
    });

    // Loki (log aggregation)
    new LokiConstruct(this, 'loki', {
      namespace,
      config,
      s3CredentialsSecretName: lokiS3Credentials.secretName,
    });

    // =========================================================================
    // Wave 3: Advanced Services
    // =========================================================================
    // Alloy (log collection - after Loki is ready)
    new AlloyConstruct(this, 'alloy', {
      namespace,
      config,
    });

    // Thanos Query (unified query interface - after Prometheus is ready)
    new ThanosQueryConstruct(this, 'thanos-query', {
      namespace,
      config,
    });

    // Thanos Store (S3 gateway - after S3 bucket and credentials)
    new ThanosStoreConstruct(this, 'thanos-store', {
      namespace,
      config,
    });

    // Thanos Compactor (downsampling - after S3 bucket and credentials)
    new ThanosCompactorConstruct(this, 'thanos-compactor', {
      namespace,
      config,
    });

    // =========================================================================
    // Tempo tracing (opt-in)
    // =========================================================================
    // Only created when config.tempo.enabled is true. Apps send OTLP to the
    // alloy-traces gateway, which tail-samples and forwards to Tempo (S3-backed).
    if (config.tempo.enabled) {
      new TempoS3BucketConstruct(this, 'tempo-s3-bucket', { config });
      const tempoCreds = new TempoS3CredentialsConstruct(this, 'tempo-s3-credentials', {
        namespace,
        config,
      });
      new TempoConstruct(this, 'tempo', {
        namespace,
        config,
        s3CredentialsSecretName: tempoCreds.secretName,
      });
      new AlloyTracesConstruct(this, 'alloy-traces', { namespace, config });
    }

    // =========================================================================
    // Generic infrastructure monitors (opt-in, off by default)
    // =========================================================================
    // Scrape configs (and optional dashboard/alerts) for infra components that
    // ship with the environment. Only created when explicitly enabled.
    if (config.traefik.enabled) {
      new TraefikMonitorConstruct(this, 'traefik-monitor', {
        monitoringNamespace: namespace,
        traefik: config.traefik,
      });
    }
    if (config.longhorn.enabled) {
      new LonghornMonitorConstruct(this, 'longhorn-monitor', {
        monitoringNamespace: namespace,
        longhorn: config.longhorn,
      });
    }
  }
}
