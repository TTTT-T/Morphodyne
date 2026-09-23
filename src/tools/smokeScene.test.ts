import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { createPassiveBlueprint } from './smokeScene';

describe('passive multi-part assembly', () => {
  it('creates five physical parts and four joints that settle on the ground', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 8, y: 0.1, z: 8 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const blueprint = createPassiveBlueprint();
    const body = physics.createBody({ id: 'assembly', blueprint }, { x: 0, y: 0.65, z: 0 });
    expect(body.partHandles.size).toBe(5);
    expect(body.connectionHandles.size).toBe(4);
    for (let tick = 0; tick < 240; tick++) physics.step(1 / 60);
    const center = body.readPartPose('part-0').position;
    expect(center.y).toBeGreaterThan(1.6);
    expect(center.y).toBeLessThan(2);
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.z)).toBeLessThan(0.05);
    for (let index = 1; index <= 4; index++) {
      const support = body.readPartPose(`part-${index}`).position;
      expect(support.y).toBeGreaterThan(0.6);
      expect(support.y).toBeLessThan(0.9);
    }
  });
});
