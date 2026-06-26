import { App } from 'cdk8s';
import { MonitoringChart, mergeConfig } from '../src';

const app = new App();
const config = mergeConfig({
  namespace: 'monitoring',
  domains: { grafana: 'grafana.example.com' },
  s3: {
    endpoint: 'https://s3.example.com',
    endpointNoProtocol: 's3.example.com',
    region: 'eu',
    buckets: { thanos: 'example-thanos', loki: 'example-loki' },
  },
  smtp: { host: 'mail.example.com', port: 587, from: 'monitoring@example.com', requireTls: true },
  integrations: {
    s3ProviderConfig: 'example-s3',
    s3SecretStore: 'example-s3-store',
    s3CredentialsKey: 'example-s3-credentials',
    grafanaSecretStore: 'example-app-secrets-store',
    grafanaCredentialsKey: 'example-grafana-admin',
  },
  tempo: {
    enabled: true,
    bucket: 'example-tempo',
    retention: '336h',
    tailSampling: { latencyThresholdMs: 1000, probabilisticPercent: 10 },
  },
});
new MonitoringChart(app, 'monitoring', config);
app.synth();
