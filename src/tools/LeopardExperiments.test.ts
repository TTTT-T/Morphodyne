import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { LeopardAgentRuntime } from './LeopardAgent';
import { createLeopardBlueprint } from './LeopardBlueprint';

describe('Leopard physical experiments', () => {
  it('attempts solo posture control through joints and floor contact', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics, { surfaces: [{ id: 'floor',
      position: { x: 0, y: -0.15, z: 0 }, halfExtents: { x: 8, y: 0.15, z: 8 }, friction: 1.4 }] });
    const agent = new LeopardAgentRuntime();
    world.spawn({ id: 'solo', blueprint: createLeopardBlueprint() }, {
      energy: { capacityJ: 12000, maxPowerWatts: 650, efficiency: 0.82 },
      agent: { control: (seconds) => agent.control(world.readSensorRuntime('solo')?.readAgentView()
        ?? { tick: -1, perceptions: [] }, seconds) },
    });
    let minimumChestHeight = Infinity;
    let pawContactTicks = 0;
    for (let i = 0; i < 120; i += 1) {
      world.stepOnce();
      minimumChestHeight = Math.min(minimumChestHeight, world.readPartPose('solo', 'leopard-chest').position.y);
      if (world.readPartContacts('solo', 'leopard-front-left-paw').length > 0) pawContactTicks++;
    }
    expect(minimumChestHeight).toBeGreaterThan(0.45);
    expect(pawContactTicks).toBeGreaterThan(30);
    expect(world.inspectEnergy('solo')!.consumedEnergyJ).toBeGreaterThan(0);
    expect(world.readSensorRuntime('solo')!.readAgentView().perceptions
      .some((perception) => perception.channel === 'orientation')).toBe(true);
    expect(agent.inspectDecisionHistory().length).toBeGreaterThan(0);
  });
});
