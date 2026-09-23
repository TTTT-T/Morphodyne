import { describe, expect, it } from 'vitest';
import type { Blueprint, Connection, Entity, Geometry, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

const unit = { x: 0, y: 0, z: 0, w: 1 } as const;
const material: Material = { id: 'matter', density: 1000, friction: 0.6, restitution: 0 };

function part(id: string, geometry: Geometry, position: Vector3, mass = 1): Part {
  return { id, materialId: material.id, geometry, pose: { position, rotation: unit }, mass };
}

function entity(parts: Part[], connections: Connection[] = []): Entity {
  const blueprint: Blueprint = { id: 'damage-experiment', materials: [material], parts, connections };
  return { id: 'damage-experiment-1', blueprint };
}

describe('Rapier impact and structural separation', () => {
  it('records a directly applied physical impulse for one step', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(entity([
      part('target', { kind: 'box', halfExtents: { x: 0.25, y: 0.25, z: 0.25 } }, { x: 0, y: 3, z: 0 }),
    ]));

    expect(physics.readPartImpactImpulse(body, 'target')).toBe(0);
    physics.applyImpulse(body.partHandles.get('target')!, { x: 3, y: 4, z: 0 });
    physics.step(1 / 60);

    expect(physics.readPartImpactImpulse(body, 'target')).toBeCloseTo(5, 8);
    physics.step(1 / 60);
    expect(physics.readPartImpactImpulse(body, 'target')).toBe(0);
  });

  it('converts Rapier contact force events into a part impulse', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({
      halfExtents: { x: 4, y: 0.1, z: 4 },
      position: { x: 0, y: -0.1, z: 0 },
      dynamic: false,
    });
    const body = physics.createBody(entity([
      part('target', { kind: 'sphere', radius: 0.3 }, { x: 0, y: 3, z: 0 }),
    ]));

    let maximumImpulse = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      physics.step(1 / 60);
      maximumImpulse = Math.max(maximumImpulse, physics.readPartImpactImpulse(body, 'target'));
    }

    expect(maximumImpulse).toBeGreaterThan(0);
  });

  it('removes a real joint and makes later actuator output a safe no-op', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody(entity([
      part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 3, z: 0 }),
      part('b', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0.5, y: 3, z: 0 }),
    ], [{
      id: 'hinge', fromPartId: 'a', toPartId: 'b', kind: 'revolute',
      fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: -0.25, y: 0, z: 0 },
      axis: { x: 0, y: 0, z: 1 },
    }]));

    const beforeBreak = body.readPartPose('b').position.x - body.readPartPose('a').position.x;
    physics.breakConnection(body, 'hinge');
    expect(body.connectionHandles.has('hinge')).toBe(false);
    expect(physics.readJointVelocity(body, 'hinge')).toBe(0);
    expect(physics.readJointPosition(body, 'hinge')).toBe(0);
    expect(() => physics.applyJointOutput(body, 'hinge', 100)).not.toThrow();
    physics.step(1 / 60);
    const afterNoOpOutput = body.readPartPose('b').position.x - body.readPartPose('a').position.x;
    expect(afterNoOpOutput).toBeCloseTo(beforeBreak, 4);

    physics.applyImpulse(body.partHandles.get('b')!, { x: 3, y: 0, z: 0 });
    physics.step(1 / 60);
    const afterSeparation = body.readPartPose('b').position.x - body.readPartPose('a').position.x;
    expect(afterSeparation).toBeGreaterThan(afterNoOpOutput + 0.02);
  });
});
