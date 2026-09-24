import { describe, expect, it } from 'vitest';
import type { ConnectionState, StructuralDamageState } from './damage';
import type { Blueprint, Connection, Pose, Sensor } from './model';
import { deriveStructuralComponents } from './structureOwnership';

const identityPose: Pose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

function part(id: string) {
  return {
    id,
    materialId: 'material',
    geometry: { kind: 'box' as const, halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    pose: identityPose,
  };
}

function connection(id: string, fromPartId: string, toPartId: string): Connection {
  return {
    id,
    kind: 'rigid',
    fromPartId,
    toPartId,
    fromAnchor: { x: 0, y: 0, z: 0 },
    toAnchor: { x: 0, y: 0, z: 0 },
  };
}

function sensor(id: string, partId: string): Sensor {
  return {
    id,
    partId,
    kind: 'range',
    localPose: identityPose,
    forward: { x: 0, y: 0, z: 1 },
    updatePeriodTicks: 1,
    noise: { standardDeviation: 0 },
    latencyTicks: 0,
    range: 10,
    fieldOfViewRadians: Math.PI / 2,
    resolution: 4,
  };
}

function damageState(blueprint: Blueprint, disconnected: ReadonlySet<string>): StructuralDamageState {
  const connections: Record<string, ConnectionState> = {};
  for (const item of blueprint.connections) {
    connections[item.id] = {
      connectionId: item.id,
      fromPartId: item.fromPartId,
      toPartId: item.toPartId,
      damage: {
        state: disconnected.has(item.id) ? 'separated' : 'intact',
        integrity: disconnected.has(item.id) ? 0 : 1,
        deformation: disconnected.has(item.id) ? 1 : 0,
        accumulatedImpulseNs: 0,
      },
      residualLoadCapacityNs: disconnected.has(item.id) ? 0 : 1,
      connected: !disconnected.has(item.id),
    };
  }
  return { parts: {}, connections };
}

describe('structural ownership graph', () => {
  it('derives ordered components across multiple separations and isolated Parts', () => {
    const blueprint: Blueprint = {
      id: 'ownership-fixture',
      materials: [{ id: 'material', density: 1000, friction: 0.5, restitution: 0.1 }],
      parts: ['root', 'branch', 'leaf', 'detached', 'machine', 'machine-tip', 'free'].map(part),
      // Deliberately declare edges in an order different from the Part order.
      connections: [
        connection('branch-leaf', 'branch', 'leaf'),
        connection('root-leaf', 'root', 'leaf'),
        connection('root-branch', 'root', 'branch'),
        connection('detached-machine', 'detached', 'machine'),
        connection('machine-tip', 'machine', 'machine-tip'),
        connection('detached-free', 'detached', 'free'),
      ],
      sensors: [
        sensor('machine-tip-sensor', 'machine-tip'),
        sensor('root-sensor', 'root'),
        sensor('free-sensor', 'free'),
        sensor('detached-sensor', 'detached'),
        sensor('leaf-sensor', 'leaf'),
      ],
      actuators: [
        { id: 'motor-machine', connectionId: 'machine-tip', maxOutput: 1 },
        { id: 'motor-root', connectionId: 'root-leaf', maxOutput: 1 },
        { id: 'motor-separated', connectionId: 'branch-leaf', maxOutput: 1 },
        { id: 'motor-detached', connectionId: 'detached-machine', maxOutput: 1 },
      ],
    };
    const state = damageState(blueprint, new Set(['branch-leaf', 'detached-machine', 'detached-free']));

    expect(deriveStructuralComponents(blueprint, state)).toEqual([
      {
        partIds: ['root', 'branch', 'leaf'],
        connectionIds: ['root-leaf', 'root-branch'],
        sensorIds: ['root-sensor', 'leaf-sensor'],
        actuatorIds: ['motor-root'],
      },
      {
        partIds: ['detached'],
        connectionIds: [],
        sensorIds: ['detached-sensor'],
        actuatorIds: [],
      },
      {
        partIds: ['machine', 'machine-tip'],
        connectionIds: ['machine-tip'],
        sensorIds: ['machine-tip-sensor'],
        actuatorIds: ['motor-machine'],
      },
      {
        partIds: ['free'],
        connectionIds: [],
        sensorIds: ['free-sensor'],
        actuatorIds: [],
      },
    ]);
  });
});
