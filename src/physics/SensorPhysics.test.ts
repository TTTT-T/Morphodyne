import { describe, expect, it } from 'vitest';
import type { Entity } from '../core/model';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

const identity = { x: 0, y: 0, z: 0, w: 1 } as const;

describe('physical sensor queries', () => {
  it('reports contacts only from physical collision and distinguishes a free impulse', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 4, y: 0.1, z: 4 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const entity: Entity = { id: 'body', blueprint: {
      id: 'one-part', materials: [{ id: 'mat', density: 500, friction: 0.5, restitution: 0 }],
      parts: [{ id: 'part', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, pose: { position: { x: 0, y: 1, z: 0 }, rotation: identity } }],
      connections: [],
    } };
    const body = physics.createBody(entity);
    physics.applyImpulse(body.partHandles.get('part')!, { x: 1, y: 0, z: 0 });
    physics.step(1 / 60);
    expect(physics.readPartImpactImpulse(body, 'part')).toBeGreaterThan(0);
    expect(physics.readPartContacts(body, 'part')).toEqual([]);
    let sawContact = false;
    for (let i = 0; i < 90; i += 1) {
      physics.step(1 / 60);
      if (physics.readPartContacts(body, 'part').length > 0) sawContact = true;
    }
    expect(sawContact).toBe(true);
  });

  it('raycasts physical occluders, respects range, and excludes the sensing body', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const entity: Entity = { id: 'body', blueprint: {
      id: 'one-part', materials: [{ id: 'mat', density: 500, friction: 0.5, restitution: 0 }],
      parts: [{ id: 'part', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } }, pose: { position: { x: 0, y: 2, z: 0 }, rotation: identity } }],
      connections: [],
    } };
    const body = physics.createBody(entity);
    physics.createBox({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 }, position: { x: 0, y: 2, z: -2 }, dynamic: false });
    physics.createBox({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 }, position: { x: 0, y: 2, z: -4 }, dynamic: false });
    physics.step(1 / 60);
    const origin = { x: 0, y: 2, z: 0 };
    const direction = { x: 0, y: 0, z: -1 };
    const mount = body.partHandles.get('part')!;
    expect(physics.castSensorRay(origin, direction, 1, mount)).toBeNull();
    expect(physics.castSensorRay(origin, direction, 3, mount)?.distance).toBeCloseTo(1.7, 2);
    expect(physics.castSensorRay(origin, { x: 1, y: 0, z: 0 }, 3, mount)).toBeNull();
  });

  it('sees another structure beyond its own connected parts', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const body = physics.createBody({ id: 'sensor-structure', blueprint: {
      id: 'two-parts', materials: [{ id: 'mat', density: 500, friction: 0.5, restitution: 0 }],
      parts: [
        { id: 'head', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } },
          pose: { position: { x: 0, y: 2, z: 0 }, rotation: identity } },
        { id: 'own-front', materialId: 'mat', geometry: { kind: 'box', halfExtents: { x: 0.2, y: 0.2, z: 0.2 } },
          pose: { position: { x: 1, y: 2, z: 0 }, rotation: identity } },
      ],
      connections: [{ id: 'neck', kind: 'rigid', fromPartId: 'head', toPartId: 'own-front',
        fromAnchor: { x: 0.5, y: 0, z: 0 }, toAnchor: { x: -0.5, y: 0, z: 0 } }],
    } });
    physics.createBox({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 },
      position: { x: 3, y: 2, z: 0 }, dynamic: false });
    physics.step(1 / 60);
    const hit = physics.castSensorRay({ x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, 4,
      body.partHandles.get('head')!);
    expect(hit?.distance).toBeCloseTo(2.7, 1);
  });
});
