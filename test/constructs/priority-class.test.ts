import { Testing } from 'cdk8s';
import { PriorityClassConstruct } from '../../src/constructs/priority-class';
import {
  synthesizeChart,
  findResource,
  expectLabels,
  expectSyncWave,
} from '../helpers';

describe('PriorityClassConstruct', () => {
  it('should create a PriorityClass with correct name', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expect(priorityClass).toBeDefined();
    expect(priorityClass.metadata.name).toBe('high-priority');
  });

  it('should have correct priority value', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expect(priorityClass.value).toBe(10000);
  });

  it('should not be global default', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expect(priorityClass.globalDefault).toBe(false);
  });

  it('should have correct description', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expect(priorityClass.description).toBe(
      'Use this class for high-priority pods only.',
    );
  });

  it('should have correct labels', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expectLabels(priorityClass, {
      'app.kubernetes.io/name': 'high-priority',
      'app.kubernetes.io/component': 'scheduling',
      'app.kubernetes.io/managed-by': 'cdk8s',
    });
  });

  it('should have sync-wave 0 annotation', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expectSyncWave(priorityClass, '0');
  });

  it('should have correct apiVersion and kind', () => {
    // Arrange
    const chart = Testing.chart();

    // Act
    new PriorityClassConstruct(chart, 'test-priority-class');

    // Assert
    const manifests = synthesizeChart(chart);
    const priorityClass = findResource(manifests, 'PriorityClass', 'high-priority');

    expect(priorityClass.apiVersion).toBe('scheduling.k8s.io/v1');
    expect(priorityClass.kind).toBe('PriorityClass');
  });
});
