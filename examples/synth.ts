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
});
new MonitoringChart(app, 'monitoring', config);
app.synth();
