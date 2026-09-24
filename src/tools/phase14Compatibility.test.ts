import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createActiveBlueprint } from './activeBody';
import { SANDBOX_CATALOG } from './sandboxTemplates';

describe('Phase 14 contact compatibility', () => {
  it('does not fracture older ordinary structures merely from resting and falling', async () => {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 20, y: 0.1, z: 20 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const world = new WorldRuntime(physics);
    const blueprints = [createActiveBlueprint(), ...SANDBOX_CATALOG.map((entry) => typeof entry.blueprint === 'function' ? entry.blueprint() : entry.blueprint)];
    for (const [index, blueprint] of blueprints.entries()) {
      world.spawn({ id: `legacy-${index}`, blueprint }, { origin: { x: index * 4, y: 0, z: 0 } });
    }
    for (let tick = 0; tick < 180; tick += 1) world.stepOnce();
    const fractured = blueprints.flatMap((_, index) => Object.values(world.getDamageRuntime(`legacy-${index}`).state.parts)
      .filter((part) => part.damage.state === 'fractured').map((part) => `${index}:${part.partId}`));
    expect(fractured).toEqual([]);
  });
});
