/**
 * `spec.failurePolicy` for every k3s helm-controller `HelmChart` in this stack.
 *
 * The helm-controller default, `reinstall`, answers a release in state
 * `failed` with `helm uninstall` + `helm install`. The uninstall deletes every
 * Helm-owned PVC, notably Grafana's, and with it service accounts, tokens and
 * public dashboards that cannot be provisioned back (#23). `abort` leaves a
 * failed release in place for a human to fix instead.
 */
export const HELM_CHART_FAILURE_POLICY = 'abort';
