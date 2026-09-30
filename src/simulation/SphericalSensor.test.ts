import { describe, expect, it, vi } from 'vitest';
import { createDamageState } from '../core/damage';
import type { Blueprint, Pose } from '../core/model';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';
import { SensorRuntime } from './SensorRuntime';

const identity: Pose = {
  position: { x: 0, y: 2, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

function sphericalSensorBlueprint(): Blueprint {
  const material = { id: 'mat', density: 1_000, friction: 0.5, restitution: 0 };
  return {
    id: 'spherical-sensor',
    materials: [material],
    parts: [
      { id: 'base', materialId: material.id, geometry: { kind: 'box', halfExtents: { x: 0.3, y: 0.3, z: 0.3 } }, pose: identity },
      { id: 'link', materialId: material.id, geometry: { kind: 'box', halfExtents: { x: 0.3, y: 0.3, z: 0.3 } }, pose: { ...identity, position: { x: 0.6, y: 2, z: 0 } } },
    ],
    connections: [{ id: 'ball', kind: 'spherical', fromPartId: 'base', toPartId: 'link',
      fromAnchor: { x: 0.3, y: 0, z: 0 }, toAnchor: { x: -0.3, y: 0, z: 0 } }],
    sensors: [{ id: 'proprio', kind: 'proprioception', partId: 'base',
      localPose: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      forward: { x: 1, y: 0, z: 0 }, updatePeriodTicks: 1, latencyTicks: 0,
      noise: { standardDeviation: 0 }, resolution: 100 }],
  };
}

describe('spherical proprioception', () => {
  it('emits z, x, and y position/velocity pairs in the agreed order', () => {
    const blueprint = sphericalSensorBlueprint();
    const body: PhysicsBody = {
      entityId: 'spherical-sensor-entity',
      partHandles: new Map([['base', 1], ['link', 2]]),
      connectionHandles: new Map([['ball', 3]]),
      readPartPose: () => identity,
    };
    const readJointPosition = vi.fn((_body: PhysicsBody, _connectionId: string, axis?: { x: number; y: number; z: number }) =>
      axis?.z ? 3 : axis?.x ? 1 : 2);
    const readJointVelocity = vi.fn((_body: PhysicsBody, _connectionId: string, axis?: { x: number; y: number; z: number }) =>
      axis?.z ? 30 : axis?.x ? 10 : 20);
    const physics = {
      readPartAngularVelocity: () => ({ x: 0, y: 0, z: 0 }),
      readJointPosition,
      readJointVelocity,
    } as unknown as PhysicsAdapter;
    const sensors = new SensorRuntime(blueprint, 'base', physics, body, () => createDamageState(blueprint));

    sensors.afterPhysicsStep(0, 1 / 60);

    const joint = sensors.readObservations().find((entry) => entry.channel === 'joint');
    expect(joint?.values).toEqual([3, 30, 1, 10, 2, 20]);
    expect(readJointPosition).toHaveBeenNthCalledWith(1, body, 'ball', { x: 0, y: 0, z: 1 });
    expect(readJointPosition).toHaveBeenNthCalledWith(2, body, 'ball', { x: 1, y: 0, z: 0 });
    expect(readJointPosition).toHaveBeenNthCalledWith(3, body, 'ball', { x: 0, y: 1, z: 0 });
  });
});
