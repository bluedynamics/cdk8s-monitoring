import { Testing } from 'cdk8s';
import { AlloyAuditConstruct } from '../../src/constructs/alloy-audit';
import { createTestConfig, synthesizeChart, findResource, expectSyncWave } from '../helpers';

describe('AlloyAuditConstruct', () => {
  function synth(overrides?: Partial<ReturnType<typeof createTestConfig>['auditLog']>) {
    const chart = Testing.chart();
    const config = createTestConfig();
    config.auditLog = { ...config.auditLog, enabled: true, ...overrides };
    new AlloyAuditConstruct(chart, 'test-audit', { namespace: 'monitoring', config });
    return findResource(synthesizeChart(chart), 'HelmChart', 'alloy-audit');
  }

  it('creates a DaemonSet-mode alloy HelmChart in sync wave 3 pinned to the configured chart version', () => {
    const helm = synth();
    expect(helm.metadata.namespace).toBe('monitoring');
    expect(helm.spec.chart).toBe('alloy');
    expect(helm.spec.version).toBe('v1.6.1');
    expectSyncWave(helm, '3');
    expect(helm.spec.valuesContent).toContain('type: daemonset');
  });

  it('schedules only on the control planes and tolerates their taints', () => {
    const values = synth().spec.valuesContent;
    expect(values).toContain('node-role.kubernetes.io/control-plane: "true"');
    expect(values).toContain('- key: node-role.kubernetes.io/control-plane\n      operator: Exists');
    expect(values).toContain('- key: node-role.kubernetes.io/master\n      operator: Exists');
  });

  it('mounts the audit directory read-only, keeps positions on the host and runs as root without capabilities', () => {
    const values = synth().spec.valuesContent;
    expect(values).toContain('path: /var/log/k3s-audit\n          type: Directory');
    expect(values).toContain('mountPath: /var/log/k3s-audit\n        readOnly: true');
    expect(values).toContain('storagePath: /var/lib/alloy-audit');
    expect(values).toContain('runAsUser: 0');
    expect(values).toContain('seLinuxOptions:\n      type: spc_t');
    expect(values).toContain('drop:\n        - ALL');
    expect(values).toContain('rbac:\n  create: false');
  });

  it('tails the audit files as job k3s-audit and writes to the Loki gateway with the cluster label', () => {
    const values = synth().spec.valuesContent;
    expect(values).toContain('__path__ = "/var/log/k3s-audit/*.log"');
    expect(values).toContain('job      = "k3s-audit"');
    expect(values).toContain('loki.source.file "audit"');
    expect(values).toContain('user      = "user.username"');
    expect(values).toContain('url = "http://loki-gateway.monitoring.svc.cluster.local/loki/api/v1/push"');
    expect(values).toContain('cluster = "test-cluster"');
  });

  it('counts audit events for Prometheus without adding labels to the Loki streams', () => {
    const values = synth().spec.valuesContent;
    expect(values).toContain('code      = "responseStatus.code"');
    expect(values).toContain('name        = "k3s_audit_events_total"');
    expect(values.indexOf('stage.labels')).toBeLessThan(values.indexOf('stage.metrics'));
    expect(values.indexOf('stage.metrics')).toBeLessThan(values.indexOf('stage.label_drop'));
    expect(values).toContain('values = ["verb", "user", "resource", "namespace", "code"]');
    expect(values).toContain('serviceMonitor:\n  enabled: true\n  additionalLabels:\n    release: kube-prometheus-stack');
  });

  it('honours a custom path and node selector', () => {
    const values = synth({ path: '/var/log/kubernetes/audit', nodeSelector: { 'node-role.kubernetes.io/master': '' } }).spec.valuesContent;
    expect(values).toContain('__path__ = "/var/log/kubernetes/audit/*.log"');
    expect(values).toContain('path: /var/log/kubernetes/audit');
    expect(values).toContain('node-role.kubernetes.io/master: ""');
  });

  it('uses the alloyAudit resource requirements', () => {
    const values = synth().spec.valuesContent;
    expect(values).toContain('cpu: 50m\n    memory: 128Mi');
    expect(values).toContain('cpu: 200m\n    memory: 256Mi');
  });
});
