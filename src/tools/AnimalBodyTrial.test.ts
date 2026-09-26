import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createPassiveObjectBlueprint } from './worldFixtures';
import { LeopardAgentRuntime } from './LeopardAgent';
import { createLeopardBlueprint } from './LeopardBlueprint';
import { createArenaSession } from './ArenaSession';

const floor = { surfaces: [{ id: 'floor', position: { x: 0, y: -0.15, z: 0 },
  halfExtents: { x: 12, y: 0.15, z: 12 }, friction: 1.4 }] };

async function solo(target?: { x: number; z: number }) {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics, floor);
  const agent = new LeopardAgentRuntime();
  world.spawn({ id: 'solo', blueprint: createLeopardBlueprint() }, {
    energy: { capacityJ: 12000, maxPowerWatts: 650, efficiency: 0.82 },
    agent: { control: (seconds) => agent.control(world.readSensorRuntime('solo')?.readAgentView()
      ?? { tick: -1, perceptions: [] }, seconds) },
  });
  if (target) world.spawn({ id: 'target', blueprint: createPassiveObjectBlueprint({
    halfExtents: { x: 0.35, y: 0.5, z: 0.35 }, mass: 80,
  }) }, { origin: { x: target.x, y: 0, z: target.z } });
  return { world, agent };
}

function pose(world: WorldRuntime) {
  const chest = world.readPartPose('solo', 'leopard-chest');
  const q = chest.rotation;
  return { x: chest.position.x, y: chest.position.y, z: chest.position.z,
    up: 1 - 2 * (q.x ** 2 + q.z ** 2),
    heading: Math.atan2(2 * (q.x * q.z - q.w * q.y), 1 - 2 * (q.y ** 2 + q.z ** 2)) };
}

describe('animal body physical trials', () => {
  it('stands, advances and turns toward sensed objects on both sides', async () => {
    const results = new Map<string, { x: number; minY: number; minUp: number;
      minHeading: number; maxHeading: number; pawTicks: number; approach: boolean }>();
    for (const [name, target] of [
      ['stand', undefined], ['forward', { x: 4, z: 0 }],
      ['left', { x: 2.5, z: -1.2 }], ['right', { x: 2.5, z: 1.2 }],
    ] as const) {
      const { world, agent } = await solo(target);
      let pawTicks = 0;
      let minY = Infinity;
      let minUp = Infinity;
      let minHeading = Infinity;
      let maxHeading = -Infinity;
      for (let i = 0; i < 240; i += 1) {
        world.stepOnce();
        const current = pose(world);
        minY = Math.min(minY, current.y);
        minUp = Math.min(minUp, current.up);
        minHeading = Math.min(minHeading, current.heading);
        maxHeading = Math.max(maxHeading, current.heading);
        if (world.readPartContacts('solo', 'leopard-front-left-paw').length) pawTicks++;
      }
      results.set(name, { x: pose(world).x, minY, minUp, minHeading, maxHeading, pawTicks,
        approach: agent.inspectDecisionHistory().some((decision) => decision.skill === 'approach') });
      expect(world.inspectEnergy('solo')!.consumedEnergyJ).toBeGreaterThan(0);
    }
    expect(results.get('stand')!.minY).toBeGreaterThan(0.75);
    expect(results.get('stand')!.minUp).toBeGreaterThan(0.9);
    expect(results.get('stand')!.pawTicks).toBeGreaterThan(160);
    expect(results.get('forward')!.approach).toBe(true);
    expect(results.get('forward')!.x).toBeGreaterThan(0.75);
    expect(results.get('left')!.approach).toBe(true);
    expect(results.get('right')!.approach).toBe(true);
    expect(results.get('left')!.minHeading).toBeLessThan(-0.15);
    expect(results.get('right')!.maxHeading).toBeGreaterThan(0.3);
  });

  it('returns upright after a lateral impulse to the torso', async () => {
    const { world, agent } = await solo();
    for (let i = 0; i < 90; i += 1) world.stepOnce();
    const before = pose(world);
    world.applyImpact('solo', 'leopard-chest', { x: 0, y: 0, z: 50 });
    let minUp = Infinity;
    for (let i = 0; i < 180; i += 1) {
      world.stepOnce();
      minUp = Math.min(minUp, pose(world).up);
    }
    const after = pose(world);
    expect(before.up).toBeGreaterThan(0.95);
    expect(minUp).toBeLessThan(0.98);
    expect(after.up).toBeGreaterThan(0.99);
    expect(after.y).toBeGreaterThan(0.75);
    expect(after.z - before.z).toBeGreaterThan(0.5);
    expect(agent.inspectDecisionHistory().length).toBeGreaterThan(1);
  });

  it('brings two independent agents into head and forelimb contact with joint motion', async () => {
    const session = await createArenaSession();
    const { world } = session;
    let minGap = Infinity;
    let contactTicks = 0;
    let headTicks = 0;
    let frontTicks = 0;
    let interactTicks = 0;
    let forelimbRange = [Infinity, -Infinity];
    let neckRange = [Infinity, -Infinity];
    for (let i = 0; i < 600; i += 1) {
      world.stepOnce();
      const a = world.readPartPose('leopard-a', 'leopard-chest').position;
      const b = world.readPartPose('leopard-b', 'leopard-chest').position;
      minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
      if (session.agents.get('leopard-a')?.inspect().skill === 'interact') interactTicks++;
      const touching = world.inspectEntity('leopard-a')!.partIds.filter((partId) =>
        world.readPartContacts('leopard-a', partId).some((contact) => contact.otherEntityId === 'leopard-b'));
      if (touching.length) contactTicks++;
      if (touching.some((id) => id.includes('head') || id.includes('jaw'))) headTicks++;
      if (touching.some((id) => id.includes('front'))) frontTicks++;
      const proprio = world.readSensorRuntime('leopard-a')?.readAgentView().perceptions ?? [];
      const hip = proprio.find((item) => item.ownConnectionId === 'leopard-front-left-hip-joint')?.values;
      const neck = proprio.find((item) => item.ownConnectionId === 'leopard-neck-joint')?.values;
      if (hip) forelimbRange = [Math.min(forelimbRange[0], hip[0]), Math.max(forelimbRange[1], hip[0])];
      if (neck) neckRange = [Math.min(neckRange[0], neck[0]), Math.max(neckRange[1], neck[0])];
    }
    expect(minGap).toBeLessThan(3);
    expect(contactTicks).toBeGreaterThan(50);
    expect(headTicks).toBeGreaterThan(20);
    expect(frontTicks).toBeGreaterThan(0);
    expect(interactTicks).toBeGreaterThan(20);
    expect(forelimbRange[1] - forelimbRange[0]).toBeGreaterThan(0.5);
    expect(neckRange[1] - neckRange[0]).toBeGreaterThan(0.3);
    expect(session.agents.get('leopard-a')!.inspectDecisionHistory().length).toBeGreaterThan(1);
    expect(session.agents.get('leopard-b')!.inspectDecisionHistory().length).toBeGreaterThan(1);
  });
});
