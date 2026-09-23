import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from './RapierPhysicsAdapter';

describe('Rapier primitive adapter', () => {
  it('lets gravity and collision decide the smoke body pose', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 8, y: 0.1, z: 8 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const body = physics.createBox({ halfExtents: { x: 0.5, y: 0.5, z: 0.5 }, position: { x: 0, y: 4, z: 0 }, dynamic: true });
    for (let tick = 0; tick < 120; tick++) physics.step(1 / 60);
    expect(physics.readPose(body).position.y).toBeCloseTo(0.5, 1);
  });
});
