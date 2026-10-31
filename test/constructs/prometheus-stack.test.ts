import { Testing } from 'cdk8s';
import { parse } from 'yaml';
import { PrometheusStackConstruct } from '../../src/constructs/prometheus-stack';
import {
  createTestConfig,
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('PrometheusStackConstruct', () => {
  it('should create a HelmChart resource', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart).toBeDefined();
    expect(helmChart.metadata.name).toBe('kube-prometheus-stack');
    expect(helmChart.metadata.namespace).toBe('monitoring');
  });

  it('should use correct Helm repository and chart', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.repo).toBe(
      'https://prometheus-community.github.io/helm-charts',
    );
    expect(helmChart.spec.chart).toBe('kube-prometheus-stack');
    expect(helmChart.spec.version).toBe(config.versions.prometheusStack);
  });

  it('should deploy to monitoring namespace', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.spec.targetNamespace).toBe('monitoring');
  });

  it('should configure Prometheus resources', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      resources: {
        ...createTestConfig().resources,
        prometheus: {
          requests: { cpu: '100m', memory: '1500Mi' },
          limits: { cpu: '2000m', memory: '3000Mi' },
        },
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('cpu: 100m');
    expect(values).toContain('memory: 1500Mi');
    expect(values).toContain('cpu: 2000m');
    expect(values).toContain('memory: 3000Mi');
  });

  it('should configure Prometheus replicas and retention', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      replicas: {
        ...createTestConfig().replicas,
        prometheus: 2,
      },
      retention: {
        ...createTestConfig().retention,
        prometheus: '3d',
      },
      storage: {
        ...createTestConfig().storage,
        prometheus: '3Gi',
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('replicas: 2');
    expect(values).toContain('retention: 3d');
    expect(values).toContain('storage: 3Gi');
  });

  it('should discover ServiceMonitors, PodMonitors and PrometheusRules cluster-wide', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // Rules must use a select-all selector too, otherwise hand-authored
    // PrometheusRules without the release label are silently ignored.
    expect(values).toContain('serviceMonitorSelectorNilUsesHelmValues: false');
    expect(values).toContain('podMonitorSelectorNilUsesHelmValues: false');
    expect(values).toContain('ruleSelectorNilUsesHelmValues: false');
    expect(values).toContain('ruleNamespaceSelector: {}');
  });

  it('should configure Thanos sidecar', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      versions: {
        ...createTestConfig().versions,
        thanos: 'v0.37.2',
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // The sidecar image is injected by the Prometheus Operator, not set in
    // helm values. What matters is that the objectStorageConfig uses the
    // existingSecret shape required by chart >=85.x (the flat {name, key}
    // form is silently dropped, removing the sidecar).
    expect(values).toContain('thanosService:');
    expect(values).toContain('objectStorageConfig:');
    expect(values).toContain('existingSecret:');
    expect(values).toContain('name: thanos-objstore-config');
    expect(values).toContain('key: objstore.yml');
  });

  it('should configure Grafana with correct domain', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      domains: {
        grafana: 'grafana.example.com',
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('- grafana.example.com');
  });

  it('should configure Grafana datasources for Thanos and Loki', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    // Thanos Query datasource
    expect(values).toContain('name: Prometheus');
    expect(values).toContain('type: prometheus');
    expect(values).toContain('url: http://thanos-query.monitoring.svc.cluster.local:9090');

    // Loki datasource
    expect(values).toContain('name: Loki');
    expect(values).toContain('type: loki');
    expect(values).toContain('url: http://loki-gateway.monitoring.svc.cluster.local');
  });

  it('should configure Alertmanager with SMTP', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig({
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        from: 'alerts@example.com',
        username: 'test-user',
        password: 'test-pass',
        requireTls: true,
      },
    });

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('smarthost: smtp.example.com:587');
    expect(values).toContain('from: alerts@example.com');
    expect(values).toContain('auth_username: test-user');
    expect(values).toContain('auth_password: test-pass');
    expect(values).toContain('require_tls: true');
  });

  it('should have sync-wave 2 annotation', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectSyncWave(helmChart, '2');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expectLabels(helmChart, {
      'app.kubernetes.io/name': 'kube-prometheus-stack',
      'app.kubernetes.io/component': 'monitoring',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');

    expect(helmChart.apiVersion).toBe('helm.cattle.io/v1');
    expect(helmChart.kind).toBe('HelmChart');
  });

  it('should configure storage class as longhorn', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('storageClassName: longhorn');
  });

  it('should configure priority class as high-priority', () => {
    // Arrange
    const chart = Testing.chart();
    const config = createTestConfig();

    // Act
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config,
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const helmChart = findResource(manifests, 'HelmChart');
    const values = helmChart.spec.valuesContent;

    expect(values).toContain('priorityClassName: high-priority');
  });

  it('adds a Tempo datasource with log/metric correlation when tempo is enabled', () => {
    const chart = Testing.chart();
    const config = createTestConfig({ tempo: { ...createTestConfig().tempo, enabled: true, bucket: 'b' } });
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain('type: tempo');
    expect(values).toContain('http://tempo.monitoring.svc.cluster.local:3200');
    expect(values).toContain('tracesToLogsV2');
    expect(values).toContain('tracesToMetrics');
    expect(values).toContain('timeout: 60'); // slow trace searches must not surface as "connect failed"
  });

  it('omits the Tempo datasource when tempo is disabled', () => {
    const chart = Testing.chart();
    const config = createTestConfig({ tempo: { ...createTestConfig().tempo, enabled: false, bucket: '' } });
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).not.toContain('type: tempo');
  });

  it('routes staging-namespace alerts to the demoted staging receiver when stagingAlerts is enabled', () => {
    const chart = Testing.chart();
    const config = createTestConfig({ stagingAlerts: { enabled: true, namespaces: ['myapp-stage', 'other-stage'] } });
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain('namespace: ^(myapp-stage|other-stage)$');
    expect(values).toContain('receiver: staging');
    expect(values).toContain('- name: staging');
    expect(values).toContain("subject: '[STAGING] {{ template \"email.default.subject\" . }}'");
  });

  it('omits the staging route and receiver when stagingAlerts is disabled', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).not.toContain('receiver: staging');
    expect(values).not.toContain('- name: staging');
  });

  it('lets dashboard ConfigMaps pick a Grafana folder via the grafana_folder annotation', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain('folderAnnotation: grafana_folder');
    expect(values).toContain('foldersFromFilesStructure: true');
  });

  it('uses config.clusterName for the cluster external label and ships no kup6s-specific alert', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain(`cluster: ${config.clusterName}`);
    expect(values).not.toContain('cluster: kup6s');
    expect(values).not.toContain('ExWorkerNotReady');
    expect(values).not.toContain('kup6s-ex-');
  });

  it('embeds the literal SMTP password and mails the sender when nothing else is configured', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain('smtp_auth_password: test-pass');
    expect(values).toContain('to: alerts@example.com');
    expect(values).not.toContain('smtp_auth_password_file');
    expect(values).not.toContain('secrets:');
  });

  it('reads the SMTP password from a mounted secret instead of embedding it', () => {
    const chart = Testing.chart();
    const base = createTestConfig();
    const config = createTestConfig({
      smtp: {
        ...base.smtp,
        password: 'test-pass',
        passwordSecret: { name: 'alertmanager-smtp', key: 'password' },
      },
    });
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain(
      'smtp_auth_password_file: /etc/alertmanager/secrets/alertmanager-smtp/password',
    );
    // The whole point: the password must not reach the synthesized manifest.
    expect(values).not.toContain('test-pass');
    expect(values).not.toContain('smtp_auth_password:');
    // Prometheus Operator only mounts secrets it is told about.
    expect(values).toContain('secrets:');
    expect(values).toContain('- alertmanager-smtp');
  });

  it('disables the control-plane scrape jobs k3s does not expose', () => {
    const chart = Testing.chart();
    const config = createTestConfig();
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    // k3s embeds these in the agent or the server process; scraping them yields
    // permanently firing *Down rules on a healthy cluster.
    for (const component of ['kubeEtcd', 'kubeControllerManager', 'kubeScheduler', 'kubeProxy']) {
      expect(values).toContain(`${component}:\n  enabled: false`);
    }
  });

  it('sends to every configured recipient', () => {
    const chart = Testing.chart();
    const base = createTestConfig();
    const config = createTestConfig({
      smtp: { ...base.smtp, recipients: ['a@example.com', 'b@example.org'] },
    });
    new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
    const values = findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent;
    expect(values).toContain('to: a@example.com, b@example.org');
    expect(values).not.toContain('to: alerts@example.com');
  });

  describe('alert noise', () => {
    const helmValues = (config = createTestConfig()) => {
      const chart = Testing.chart();
      new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config });
      return parse(findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent);
    };

    it('repeats an unresolved alert every 12h by default, not every hour', () => {
      expect(helmValues().alertmanager.config.route.repeat_interval).toBe('12h');
    });

    it('takes the repeat interval from config.alertRouting', () => {
      const config = createTestConfig({ alertRouting: { repeatInterval: '4h' } });
      expect(helmValues(config).alertmanager.config.route.repeat_interval).toBe('4h');
    });

    it('routes InfoInhibitor to the null receiver', () => {
      const routes = helmValues().alertmanager.config.route.routes;
      expect(routes).toContainEqual({ match: { alertname: 'InfoInhibitor' }, receiver: 'null' });
    });

    const rule = (values: any, group: string, alert: string) =>
      values.additionalPrometheusRulesMap[group].groups[0].rules.find((r: any) => r.alert === alert);

    it('replaces the stock KubeJobFailed, which fires for as long as a failed Job object exists', () => {
      const values = helmValues();
      expect(values.defaultRules.disabled.KubeJobFailed).toBe(true);
      // CronJob-owned Jobs are judged by their CronJob's last run instead.
      expect(rule(values, 'job-health', 'KubeJobFailed').expr).toContain('unless on(namespace, job_name) kube_job_owner{job="kube-state-metrics", owner_kind="CronJob"}');
    });

    it('alerts when the last run of a CronJob failed and none is running', () => {
      const expr = rule(helmValues(), 'job-health', 'KubeCronJobLastRunFailed').expr;
      expect(expr).toContain('> on(namespace, cronjob) kube_cronjob_status_last_successful_time');
      // A CronJob that never succeeded has no last_successful_time series at all.
      expect(expr).toContain('unless on(namespace, cronjob) kube_cronjob_status_last_successful_time');
      expect(expr).toContain('kube_cronjob_status_active{job="kube-state-metrics"} == 0');
    });

    it('ignores PDBs that select no pods, since they block no drain', () => {
      const values = helmValues();
      for (const alert of ['PodDisruptionBudgetUndrainable', 'PodDisruptionBudgetUndrainableCritical']) {
        expect(rule(values, 'pdb-drain-safety', alert).expr).toContain('kube_poddisruptionbudget_status_expected_pods > 0');
      }
    });

    it('mails an undrainable PDB once, not as warning and critical', () => {
      expect(helmValues().alertmanager.config.inhibit_rules).toContainEqual({
        source_match: { alertname: 'PodDisruptionBudgetUndrainableCritical' },
        target_match: { alertname: 'PodDisruptionBudgetUndrainable' },
        equal: ['namespace', 'poddisruptionbudget'],
      });
    });

    it('adds configured mail headers to the production and the staging receiver', () => {
      const base = createTestConfig();
      const config = createTestConfig({
        smtp: { ...base.smtp, headers: { 'X-Mailjet-TrackClick': '0' } },
        stagingAlerts: { enabled: true, namespaces: ['app-stage'] },
      });
      const receivers = helmValues(config).alertmanager.config.receivers;
      const headers = (name: string) => receivers.find((r: any) => r.name === name).email_configs[0].headers;
      expect(headers('email')).toEqual({ 'X-Mailjet-TrackClick': '0' });
      expect(headers('staging')['X-Mailjet-TrackClick']).toBe('0');
      expect(headers('staging').subject).toContain('[STAGING]');
    });

    it('renders no headers map without configured headers', () => {
      const receivers = helmValues().alertmanager.config.receivers;
      expect(receivers.find((r: any) => r.name === 'email').email_configs[0].headers).toBeUndefined();
    });

    it('creates the Grafana ingress with an https root_url by default', () => {
      const grafana = helmValues().grafana;
      expect(grafana.ingress.enabled).toBe(true);
      expect(grafana['grafana.ini'].server.root_url).toBe(`https://${grafana['grafana.ini'].server.domain}`);
    });

    it('can drop the Grafana ingress and take an explicit root_url', () => {
      const base = createTestConfig();
      const config = createTestConfig({
        domains: { ...base.domains, grafana: 'grafana.vpn.example', grafanaIngress: false, grafanaRootUrl: 'http://grafana.vpn.example' },
      });
      const grafana = helmValues(config).grafana;
      expect(grafana.ingress.enabled).toBe(false);
      expect(grafana['grafana.ini'].server.root_url).toBe('http://grafana.vpn.example');
    });

    it('keeps the operator default external URLs unless configured', () => {
      const values = helmValues();
      expect(values.alertmanager.alertmanagerSpec.externalUrl).toBeUndefined();
      expect(values.prometheus.prometheusSpec.externalUrl).toBeUndefined();
    });

    it('sets the external URLs that notification links point to', () => {
      const config = createTestConfig({
        externalUrls: { alertmanager: 'https://am.example.com', prometheus: 'https://metrics.example.com' },
      });
      const values = helmValues(config);
      expect(values.alertmanager.alertmanagerSpec.externalUrl).toBe('https://am.example.com');
      expect(values.prometheus.prometheusSpec.externalUrl).toBe('https://metrics.example.com');
    });

    it('provisions Alertmanager as a Grafana datasource', () => {
      const datasources = helmValues().grafana.datasources['datasources.yaml'].datasources;
      expect(datasources).toContainEqual(expect.objectContaining({
        name: 'Alertmanager',
        type: 'alertmanager',
        url: 'http://kube-prometheus-stack-alertmanager.monitoring.svc.cluster.local:9093',
      }));
    });

    it('drops the replica external label from alerts, so the two Prometheus replicas do not double every alert', () => {
      const spec = helmValues().prometheus.prometheusSpec;
      expect(spec.additionalAlertRelabelConfigs).toContainEqual({ action: 'labeldrop', regex: 'replica' });
      // Thanos deduplicates on the label, so it must stay on the metrics.
      expect(spec.externalLabels.replica).toBe('$(POD_NAME)');
    });
  });

  describe('k3s metric filtering', () => {
    const relabelings = (section: string) => {
      const chart = Testing.chart();
      new PrometheusStackConstruct(chart, 'test-helm', { namespace: 'monitoring', config: createTestConfig() });
      const values = parse(findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent);
      return { values, rules: values[section].serviceMonitor.metricRelabelings as { regex: string; action: string }[] };
    };

    it('drops the watch, workqueue and scheduler histogram buckets the k3s apiserver endpoint serves', () => {
      // k3s runs apiserver, controller-manager and scheduler in one process, so
      // the apiserver target also exposes scheduler_* and workqueue_* series.
      const { rules } = relabelings('kubeApiServer');
      const dropped = rules.filter((r) => r.action === 'drop').map((r) => r.regex);
      expect(dropped).toContain('apiserver_watch_(cache_read_wait_seconds|list_duration_seconds|events_sizes)_bucket');
      expect(dropped).toContain('workqueue_(queue|work)_duration_seconds_bucket');
      expect(dropped).toContain('scheduler_plugin_execution_duration_seconds_bucket');
    });

    it('applies the same drops to the kubelet target and stops scraping probe histograms', () => {
      const { values, rules } = relabelings('kubelet');
      const dropped = rules.filter((r) => r.action === 'drop').map((r) => r.regex);
      expect(dropped).toContain('apiserver_watch_(cache_read_wait_seconds|list_duration_seconds|events_sizes)_bucket');
      expect(dropped).toContain('workqueue_(queue|work)_duration_seconds_bucket');
      expect(values.kubelet.serviceMonitor.probes).toBe(false);
    });
  });
});

describe('PrometheusStackConstruct storage class', () => {
  const synthValues = (className: string) => {
    const chart = Testing.chart();
    new PrometheusStackConstruct(chart, 'test-helm', {
      namespace: 'monitoring',
      config: createTestConfig({ storage: { ...createTestConfig().storage, className } }),
    });
    return parse(findResource(synthesizeChart(chart), 'HelmChart').spec.valuesContent);
  };

  it('puts storage.className on the Prometheus, Alertmanager and Grafana volumes', () => {
    const values = synthValues('fast-ssd');
    expect(values.prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName).toBe('fast-ssd');
    expect(values.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.storageClassName).toBe('fast-ssd');
    expect(values.grafana.persistence.storageClassName).toBe('fast-ssd');
  });

  it('leaves the class to the cluster default when storage.className is empty', () => {
    const values = synthValues('');
    expect(values.prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec).not.toHaveProperty('storageClassName');
    expect(values.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec).not.toHaveProperty('storageClassName');
    expect(values.grafana.persistence).not.toHaveProperty('storageClassName');
  });
});
