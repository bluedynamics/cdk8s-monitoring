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
  // Publish to npm from CI on every release, tokenless via npm Trusted Publishing
  // (OIDC). Requires a Trusted Publisher to be configured for this package on
  // npmjs.com pointing at bluedynamics/cdk8s-monitoring + the release workflow.
  releaseToNpm: true,
  npmProvenance: true,
  npmTrustedPublishing: true,
  // Feature-complete: release the 1.x line (next release = 1.0.0). Supersedes the
  // earlier split tracks (GitHub v0.0.x / manual npm 0.3.x).
  majorVersion: 1,
  deps: ['cdk8s@^2.70.0', constructs, kplus, 'deepmerge-ts@^7.1.5'],
  peerDeps: ['cdk8s@^2.70.0', constructs, kplus],
  devDeps: ['cdk8s-cli', 'yaml@^2.8.1'],
  gitignore: ['dist/', '*.k8s.yaml'],
});

// Generated cdk8s imports are not hand-edited; keep them out of lint/style checks.
project.eslint?.addIgnorePattern('src/imports/');

// Keep the Sphinx docs site (and its built HTML) out of the npm tarball.
project.npmignore?.addPatterns('/documentation/');

project.synth();
