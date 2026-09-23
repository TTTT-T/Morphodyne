import { describe, expect, it } from 'vitest';
import type { Blueprint, Connection, Entity, Geometry, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

const unit = { x: 0, y: 0, z: 0, w: 1 };
const material: Material = { id: 'matter', density: 1000, friction: 0.6, restitution: 0 };

function part(id: string, geometry: Geometry, position: Vector3, mass?: number): Part {
  return { id, materialId: material.id, geometry, pose: { position, rotation: unit }, ...(mass === undefined ? {} : { mass }) };
}

function entity(parts: Part[], connections: Connection[] = [], overrides: Partial<Material> = {}): Entity {
  const blueprint: Blueprint = {
    id: 'experiment', materials: [{ ...material, ...overrides }], parts, connections,
  };
  return { id: 'experiment-1', blueprint };
}

function step(physics: RapierPhysicsAdapter, ticks = 120): void {
  for (let tick = 0; tick < ticks; tick++) physics.step(1 / 60);
}

describe('Blueprint to structural physics', () => {
  it('maps mass and primitive size to measured motion and resting height', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 8, y: 0.1, z: 8 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const body = physics.createBody(entity([
      part('light', { kind: 'sphere', radius: 0.2 }, { x: -3, y: 3, z: 0 }, 1),
      part('heavy', { kind: 'sphere', radius: 0.2 }, { x: 3, y: 3, z: 0 }, 4),
      part('large', { kind: 'box', halfExtents: { x: 0.4, y: 0.8, z: 0.4 } }, { x: 0, y: 3, z: 3 }),
    ]));
    physics.applyImpulse(body.partHandles.get('light')!, { x: 1, y: 0, z: 0 });
    physics.applyImpulse(body.partHandles.get('heavy')!, { x: 1, y: 0, z: 0 });
    step(physics, 40);
    const lightTravel = body.readPartPose('light').position.x + 3;
    const heavyTravel = body.readPartPose('heavy').position.x - 3;
    expect(lightTravel).toBeGreaterThan(heavyTravel * 2);
    step(physics, 140);
    expect(body.readPartPose('large').position.y).toBeCloseTo(0.8, 1);
    expect(body.readPartPose('heavy').position.y).toBeCloseTo(0.2, 1);
  });

  it('maps restitution to bounce height', async () => {
    async function rebound(restitution: number): Promise<number> {
      const physics = await RapierPhysicsAdapter.create();
      physics.createBox({ halfExtents: { x: 8, y: 0.1, z: 8 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
      const body = physics.createBody(entity([
        part('ball', { kind: 'sphere', radius: 0.25 }, { x: 0, y: 3, z: 0 }),
      ], [], { restitution }));
      let touched = false;
      let apex = 0;
      for (let tick = 0; tick < 120; tick++) {
        physics.step(1 / 60);
        const y = body.readPartPose('ball').position.y;
        if (y < 0.3) touched = true;
        if (touched) apex = Math.max(apex, y);
      }
      return apex;
    }
    expect(await rebound(1)).toBeGreaterThan((await rebound(0)) + 0.4);
  });

  it('maps connection anchors and prismatic limits to distinct relative travel', async () => {
    async function travel(max: number): Promise<number> {
      const physics = await RapierPhysicsAdapter.create();
      const body = physics.createBody(entity([
        part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 5, z: 0 }, 1),
        part('b', { kind: 'capsule', radius: 0.1, halfHeight: 0.2 }, { x: 0.5, y: 5, z: 0 }, 1),
      ], [{ id: 'slide', fromPartId: 'a', toPartId: 'b', kind: 'prismatic',
        fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: -0.25, y: 0, z: 0 },
        axis: { x: 1, y: 0, z: 0 }, limits: { min: 0, max },
      }]));
      expect(body.connectionHandles.size).toBe(1);
      physics.applyImpulse(body.partHandles.get('b')!, { x: 3, y: 0, z: 0 });
      step(physics, 60);
      return body.readPartPose('b').position.x - body.readPartPose('a').position.x - 0.5;
    }
    const narrow = await travel(0.1);
    const wide = await travel(1);
    expect(narrow).toBeLessThan(0.15);
    expect(wide).toBeGreaterThan(narrow + 0.35);
  });

  it('distinguishes a fixed connection from a free revolute axis', async () => {
    async function relativeRotation(kind: 'rigid' | 'revolute'): Promise<number> {
      const physics = await RapierPhysicsAdapter.create();
      const connection: Connection = {
        id: 'connection', fromPartId: 'a', toPartId: 'b', kind,
        fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: -0.25, y: 0, z: 0 },
        ...(kind === 'revolute' ? { axis: { x: 0, y: 0, z: 1 } } : {}),
      } as Connection;
      const body = physics.createBody(entity([
        part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 5, z: 0 }, 1),
        part('b', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0.5, y: 5, z: 0 }, 1),
      ], [connection]));
      physics.applyTorqueImpulse(body.partHandles.get('b')!, { x: 0, y: 0, z: 1 });
      step(physics, 60);
      const a = body.readPartPose('a').rotation;
      const b = body.readPartPose('b').rotation;
      return 1 - Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
    }
    const fixed = await relativeRotation('rigid');
    const revolute = await relativeRotation('revolute');
    expect(fixed).toBeLessThan(0.01);
    expect(revolute).toBeGreaterThan(fixed + 0.01);
  });

  it('preserves a rotated part frame in a fixed joint and accepts convex geometry', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const quarterTurn = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const rotated: Part = {
      ...part('b', { kind: 'convex', points: [
        { x: 0, y: 0, z: 0 }, { x: 0.2, y: 0, z: 0 },
        { x: 0, y: 0.2, z: 0 }, { x: 0, y: 0, z: 0.2 },
      ] }, { x: 0.5, y: 5, z: 0 }, 1),
      pose: { position: { x: 0.5, y: 5, z: 0 }, rotation: quarterTurn },
    };
    const body = physics.createBody(entity([
      part('a', { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, { x: 0, y: 5, z: 0 }, 1),
      rotated,
    ], [{ id: 'link', kind: 'rigid', fromPartId: 'a', toPartId: 'b',
      fromAnchor: { x: 0.25, y: 0, z: 0 }, toAnchor: { x: 0, y: 0, z: -0.25 },
    }]));
    step(physics, 60);
    const actual = body.readPartPose('b').rotation;
    expect(Math.abs(actual.x * quarterTurn.x + actual.y * quarterTurn.y
      + actual.z * quarterTurn.z + actual.w * quarterTurn.w)).toBeGreaterThan(0.999);
    expect(body.readPartPose('b').position.y).toBeLessThan(5);
  });
});
