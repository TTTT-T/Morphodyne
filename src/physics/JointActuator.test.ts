import { describe, expect, it } from 'vitest';
import type { Blueprint, Connection, Entity, Geometry, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

const unit = { x: 0, y: 0, z: 0, w: 1 };
const material: Material = { id: 'matter', density: 1000, friction: 0.6, restitution: 0 };

function part(id: string, geometry: Geometry, position: Vector3, mass = 1): Part {
  return { id, materialId: material.id, geometry, pose: { position, rotation: unit }, mass };
}

function entity(parts: Part[], connections: Connection[]): Entity {
  const blueprint: Blueprint = { id: 'actuator-experiment', materials: [material], parts, connections };
  return { id: 'actuator-experiment-1', blueprint };
}

function step(physics: RapierPhysicsAdapter, ticks = 1): void {
  for (let tick = 0; tick < ticks; tick += 1) physics.step(1 / 60);
}

describe('joint actuator output', () => {
  it('applies equal and opposite prismatic force for one step', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(entity([
      part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 3, z: 0 }),
      part('b', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0.5, y: 3, z: 0 }),
    ], [{
      id: 'slide', fromPartId: 'a', toPartId: 'b', kind: 'prismatic',
      fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: -0.25, y: 0, z: 0 },
      axis: { x: 1, y: 0, z: 0 },
    }]));
    const beforeA = body.readPartPose('a').position;
    const beforeB = body.readPartPose('b').position;
    const beforeCenter = (beforeA.x + beforeB.x) / 2;

    physics.applyJointOutput(body, 'slide', 30);
    step(physics);

    const afterA = body.readPartPose('a').position;
    const afterB = body.readPartPose('b').position;
    expect(afterB.x - afterA.x).toBeGreaterThan(beforeB.x - beforeA.x);
    expect(physics.readJointPosition(body, 'slide')).toBeGreaterThan(0);
    // The equal/opposite pair changes relative motion without translating the
    // equal-mass two-body center along the actuator axis.
    expect((afterA.x + afterB.x) / 2).toBeCloseTo(beforeCenter, 4);
  });

  it('clears continuous output after the step and exposes relative velocity', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(entity([
      part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 3, z: 0 }),
      part('b', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0.5, y: 3, z: 0 }),
    ], [{
      id: 'slide', fromPartId: 'a', toPartId: 'b', kind: 'prismatic',
      fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: -0.25, y: 0, z: 0 },
      axis: { x: 1, y: 0, z: 0 },
    }]));

    physics.applyJointOutput(body, 'slide', 30);
    step(physics);
    const velocityAfterOutput = physics.readJointVelocity(body, 'slide');
    step(physics);
    const velocityWithoutOutput = physics.readJointVelocity(body, 'slide');

    expect(velocityAfterOutput).toBeGreaterThan(0);
    expect(velocityWithoutOutput).toBeCloseTo(velocityAfterOutput, 3);
  });

  it('applies equal and opposite revolute torque along the current axis', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(entity([
      part('a', { kind: 'box', halfExtents: { x: 0.3, y: 0.2, z: 0.2 } }, { x: 0, y: 3, z: 0 }),
      part('b', { kind: 'box', halfExtents: { x: 0.3, y: 0.2, z: 0.2 } }, { x: 0.7, y: 3, z: 0 }),
    ], [{
      id: 'hinge', fromPartId: 'a', toPartId: 'b', kind: 'revolute',
      fromAnchor: { x: 0.35, y: 0, z: 0 }, toAnchor: { x: -0.35, y: 0, z: 0 },
      axis: { x: 0, y: 0, z: 1 },
    }]));

    physics.applyJointOutput(body, 'hinge', 8);
    step(physics);

    expect(physics.readJointVelocity(body, 'hinge')).toBeGreaterThan(0);
    expect(physics.readJointPosition(body, 'hinge')).toBeGreaterThan(0);
  });

  it('rejects invalid, unknown, and rigid joint output', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(entity([
      part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 3, z: 0 }),
      part('b', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0.5, y: 3, z: 0 }),
    ], [{
      id: 'fixed', fromPartId: 'a', toPartId: 'b', kind: 'rigid',
      fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: -0.25, y: 0, z: 0 },
    }]));

    expect(() => physics.applyJointOutput(body, 'fixed', 1)).toThrow(/rigid/);
    expect(() => physics.applyJointOutput(body, 'missing', 1)).toThrow(/Unknown connection/);
    expect(() => physics.applyJointOutput(body, 'fixed', Number.NaN)).toThrow(/finite/);
    expect(() => physics.readJointVelocity(body, 'fixed')).toThrow(/rigid/);
    expect(() => physics.readJointPosition(body, 'fixed')).toThrow(/rigid/);
  });
});
