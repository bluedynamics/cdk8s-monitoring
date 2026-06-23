import { Testing } from 'cdk8s';
import { NamespaceConstruct } from '../../src/constructs/namespace';
import {
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('NamespaceConstruct', () => {
  it('should create a namespace with correct name', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new NamespaceConstruct(chart, 'test-namespace', {
      name: 'monitoring',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'monitoring');

    expect(namespace).toBeDefined();
    expect(namespace.metadata.name).toBe('monitoring');
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new NamespaceConstruct(chart, 'test-namespace', {
      name: 'monitoring',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'monitoring');

    expectLabels(namespace, {
      'app.kubernetes.io/name': 'monitoring',
      'app.kubernetes.io/component': 'observability',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have sync-wave 0 annotation', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new NamespaceConstruct(chart, 'test-namespace', {
      name: 'monitoring',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'monitoring');

    expectSyncWave(namespace, '0');
  });

  it('should support custom namespace names', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new NamespaceConstruct(chart, 'test-namespace', {
      name: 'custom-observability',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'custom-observability');

    expect(namespace).toBeDefined();
    expect(namespace.metadata.name).toBe('custom-observability');
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new NamespaceConstruct(chart, 'test-namespace', {
      name: 'monitoring',
    });

    // Assert
    const manifests = synthesizeChart(chart);
    const namespace = findResource(manifests, 'Namespace', 'monitoring');

    expect(namespace.apiVersion).toBe('v1');
    expect(namespace.kind).toBe('Namespace');
  });
});
