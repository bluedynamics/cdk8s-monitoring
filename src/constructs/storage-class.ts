/**
 * A `<key>: <className>` line for a Helm values template, starting with a
 * newline and `indent`. Empty when no class is configured, so the PVC gets the
 * cluster's default StorageClass.
 */
export function storageClassLine(key: string, className: string, indent: string): string {
  return className ? `\n${indent}${key}: ${className}` : '';
}
