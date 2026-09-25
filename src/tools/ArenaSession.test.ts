import { describe, expect, it } from 'vitest';
import { createArenaSession } from './ArenaSession';

describe('Arena v0.1 physical session', () => {
  it('moves, collides, fractures, loses an actuator and resets all match state', async () => {
    const first = await createArenaSession();
    const world = first.world;
    expect(world.listEntities().map((entity) => entity.id)).toEqual(['rammer', 'gripper']);
    expect(world.paused).toBe(true);
    expect(world.inspectEntity('rammer')!.actuatorIds).toHaveLength(2);
    expect(world.inspectEntity('gripper')!.actuatorIds).toHaveLength(4);
    first.player.set('rammer-left-drive', 'joint', -1);
    first.player.set('rammer-right-drive', 'joint', -1);

    const start = world.readPartPose('rammer', 'rammer-chassis').position.x;
    let fighterContactTicks = 0;
    let peakNoseForceN = 0;
    let peakJawForceN = 0;
    let firstFractureTick: number | undefined;
    let firstSeparationTick: number | undefined;
    let jawContactAtFracture = false;
    for (let i = 0; i < 240; i += 1) {
      world.stepOnce();
      const nose = world.readPartContactLoad('rammer', 'rammer-nose')!;
      const jaw = world.readPartContactLoad('gripper', 'gripper-left-jaw')!;
      peakNoseForceN = Math.max(peakNoseForceN, nose.forceN);
      peakJawForceN = Math.max(peakJawForceN, jaw.forceN);
      if (world.readPartContacts('rammer', 'rammer-nose').some(({ point }) => point.y > 0.25)) fighterContactTicks++;
      const damage = world.getDamageRuntime('gripper').state;
      if (firstFractureTick === undefined && damage.parts['gripper-left-jaw'].damage.state === 'fractured') {
        firstFractureTick = world.tick;
        jawContactAtFracture = world.readPartContacts('gripper', 'gripper-left-jaw')
          .some(({ point }) => point.y > 0.25);
      }
      if (firstSeparationTick === undefined && !damage.connections['gripper-left-slide'].connected) {
        firstSeparationTick = world.tick;
      }
    }
    const observation = first.observer.observe(world);
    console.info('Arena v0.1 physical trial', {
      initialSeparationM: 4.6,
      rammerAdvanceM: world.readPartPose('rammer', 'rammer-chassis').position.x - start,
      fighterContactTicks, peakNoseForceN, peakJawForceN,
      firstFractureTick, firstSeparationTick, jawContactAtFracture,
      gripper: observation.fighters[1],
    });
    expect(world.readPartPose('rammer', 'rammer-chassis').position.x - start).toBeGreaterThan(0.5);
    expect(world.inspectEnergy('rammer')!.consumedEnergyJ).toBeGreaterThan(0);
    expect(world.inspectEnergy('gripper')!.consumedEnergyJ).toBeGreaterThan(0);
    expect(fighterContactTicks).toBeGreaterThan(0);
    expect(peakNoseForceN).toBeGreaterThan(0);
    expect(peakJawForceN).toBeGreaterThan(0);
    expect(firstFractureTick).toBeGreaterThan(0);
    expect(firstSeparationTick).toBe(firstFractureTick);
    expect(jawContactAtFracture).toBe(true);
    expect(observation.fighters[1].fracturedParts).toBeGreaterThan(0);
    expect(observation.fighters[1].separatedConnections).toBeGreaterThan(0);
    expect(observation.fighters[1].activeActuators).toBeLessThan(4);

    const next = await createArenaSession();
    expect(next.world.tick).toBe(0);
    expect(next.world.listEntities().map((entity) => entity.id)).toEqual(['rammer', 'gripper']);
    expect(next.world.inspectEnergy('rammer')!.consumedEnergyJ).toBe(0);
    expect(next.world.inspectEntity('gripper')!.actuatorIds).toHaveLength(4);
    expect(next.observer.observe(next.world).fighters.every((fighter) => fighter.fracturedParts === 0)).toBe(true);
    expect(next.player.get('rammer-left-drive')).toBe(0);
  });

  it('opponent approaches through wheel signals and observer reports only inspected state', async () => {
    const session = await createArenaSession();
    const initialX = session.world.readPartPose('gripper', 'gripper-chassis').position.x;
    for (let i = 0; i < 90; i += 1) session.world.stepOnce();
    const currentX = session.world.readPartPose('gripper', 'gripper-chassis').position.x;
    const jawGap = session.world.readPartPose('gripper', 'gripper-right-jaw').position.z
      - session.world.readPartPose('gripper', 'gripper-left-jaw').position.z;
    expect(currentX).toBeLessThan(initialX - 0.2);
    expect(jawGap).toBeLessThan(0.4);
    expect(session.world.getDamageRuntime('gripper').state.connections['gripper-left-slide'].connected).toBe(true);
    expect(session.world.getDamageRuntime('gripper').state.connections['gripper-right-slide'].connected).toBe(true);
    const before = session.observer.observe(session.world);
    expect(before.ended).toBe(false);
    const manual = session.observer.observe(session.world, true);
    expect(manual.ended).toBe(true);
    expect(manual.reason).toBe('手动结束');
    expect(session.world.paused).toBe(true);
    expect(session.world.tick).toBe(90);
  });
});
