import { typescript } from 'projen';
import { NpmAccess } from 'projen/lib/javascript';

const kplus = 'cdk8s-plus-33@^2.4.0';
const constructs = 'constructs@^10.4.2';

const project = new typescript.TypeScriptProject({
  name: '@bluedynamics/cdk8s-monitoring',
  description: 'Generic cdk8s monitoring stack (Prometheus, Thanos, Loki, Grafana, Alloy) for Kubernetes',
  authorName: 'Jens W. Klein',
  authorEmail: 'jk@kleinundpartner.at',
  license: 'Apache-2.0',
  repository: 'https://github.com/bluedynamics/cdk8s-monitoring.git',
  defaultReleaseBranch: 'main',
  projenrcTs: true,
  npmAccess: NpmAccess.PUBLIC,
  deps: ['cdk8s@^2.70.0', constructs, kplus, 'deepmerge-ts@^7.1.5'],
  peerDeps: ['cdk8s@^2.70.0', constructs, kplus],
  devDeps: ['cdk8s-cli', 'yaml@^2.8.1'],
  gitignore: ['dist/', '*.k8s.yaml'],
});

project.synth();
