import { describe, expect, it } from 'vitest';
import { createArenaSession } from './ArenaSession';

describe('Animal Arena v0.2 autonomous session', () => {
  it('spawns two independently sensed and controlled physical Leopard Agents', async () => {
    const session = await createArenaSession();
    const { world, agents } = session;
    expect(world.listEntities().map((entity) => entity.id)).toEqual(['leopard-a', 'leopard-b']);
    expect(world.paused).toBe(false);
    expect(agents.get('leopard-a')).not.toBe(agents.get('leopard-b'));
    for (const id of ['leopard-a', 'leopard-b']) {
      const entity = world.inspectEntity(id)!;
      expect(entity.agentPresent).toBe(true);
      expect(entity.partIds).toHaveLength(20);
      expect(entity.sensorIds.length).toBeGreaterThanOrEqual(6);
      expect(entity.actuatorIds.length).toBeGreaterThanOrEqual(8);
      expect(world.readBlueprint(id).parts.some((part) => part.id === 'leopard-jaw')).toBe(true);
      expect(world.inspectEnergy(id)!.remainingEnergyJ).toBe(12000);
    }
    expect(world.readSensorRuntime('leopard-a')).not.toBe(world.readSensorRuntime('leopard-b'));
    for (let i = 0; i < 5; i += 1) world.stepOnce();
    expect(agents.get('leopard-a')!.inspect().perceptionTick).toBeGreaterThanOrEqual(0);
    expect(agents.get('leopard-b')!.inspect().perceptionTick).toBeGreaterThanOrEqual(0);
    expect(agents.get('leopard-a')!.inspectDecisionHistory().length).toBeGreaterThan(0);
    expect(agents.get('leopard-b')!.inspectDecisionHistory().length).toBeGreaterThan(0);
    expect(session.observer.observe(world).fighters).toHaveLength(2);
  });

  it('runs an autonomous physical trial with measured movement and jaw state', async () => {
    const session = await createArenaSession();
    const { world } = session;
    const initialA = world.readPartPose('leopard-a', 'leopard-chest').position;
    const initialB = world.readPartPose('leopard-b', 'leopard-chest').position;
    let minimumGap = Math.abs(initialB.x - initialA.x);
    let opponentContactTicks = 0;
    let firstOpponentContact: { tick: number; partId: string; otherPartId?: string; impulseNs: number } | undefined;
    let minJawAngle = Infinity;
    let maxJawAngle = -Infinity;
    let maxHeadImpulseNs = 0;
    let opponentHeadContactTicks = 0;
    let jawOpponentContactTicks = 0;
    let deformationWhileOpponentsTouch = 0;
    const aPartIds = world.inspectEntity('leopard-a')!.partIds;
    for (let i = 0; i < 600; i += 1) {
      world.stepOnce();
      const a = world.readPartPose('leopard-a', 'leopard-chest').position;
      const b = world.readPartPose('leopard-b', 'leopard-chest').position;
      minimumGap = Math.min(minimumGap, Math.hypot(a.x - b.x, a.z - b.z));
      const jawPerception = world.readSensorRuntime('leopard-a')!.readAgentView().perceptions
        .find((p) => p.ownConnectionId === 'leopard-jaw-joint');
      if (jawPerception) {
        minJawAngle = Math.min(minJawAngle, jawPerception.values[0]);
        maxJawAngle = Math.max(maxJawAngle, jawPerception.values[0]);
      }
      const headDamage = world.getDamageRuntime('leopard-a').state.parts['leopard-head'].damage;
      if (world.readPartContacts('leopard-a', 'leopard-head')
        .some((contact) => contact.otherEntityId === 'leopard-b')) {
        opponentHeadContactTicks++;
        deformationWhileOpponentsTouch = Math.max(deformationWhileOpponentsTouch, headDamage.deformation);
      }
      if (world.readPartContacts('leopard-a', 'leopard-jaw')
        .some((contact) => contact.otherEntityId === 'leopard-b')) jawOpponentContactTicks++;
      const headLoad = world.readPartContactLoad('leopard-a', 'leopard-head')!;
      maxHeadImpulseNs = Math.max(maxHeadImpulseNs, headLoad.impulseNs);
      for (const partId of aPartIds) {
        const contact = world.readPartContacts('leopard-a', partId)
          .find((item) => item.otherEntityId === 'leopard-b');
        if (contact) {
          opponentContactTicks++;
          firstOpponentContact ??= { tick: world.tick, partId, otherPartId: contact.otherPartId,
            impulseNs: contact.impulseNs };
          break;
        }
      }
    }
    const observation = session.observer.observe(world);
    expect(world.tick).toBe(600);
    expect(minimumGap).toBeLessThan(Math.abs(initialB.x - initialA.x) - 1);
    expect(firstOpponentContact?.tick).toBeGreaterThan(0);
    expect(firstOpponentContact?.otherPartId).toBeDefined();
    expect(opponentContactTicks).toBeGreaterThan(30);
    expect(maxJawAngle - minJawAngle).toBeGreaterThan(0.2);
    expect(opponentHeadContactTicks).toBeGreaterThan(10);
    expect(jawOpponentContactTicks).toBeGreaterThan(0);
    expect(deformationWhileOpponentsTouch).toBeGreaterThan(0);
    expect(maxHeadImpulseNs).toBeGreaterThan(0);
    // Compliance absorbs part of this repeatable contact. Fracture remains a
    // material/load outcome, not an acceptance target for this body change.
    expect(world.getDamageRuntime('leopard-a').state.parts['leopard-head'].damage.deformation).toBeGreaterThan(0);
    expect(session.agents.get('leopard-a')!.inspectDecisionHistory()
      .some((decision) => decision.tick > firstOpponentContact!.tick)).toBe(true);
    expect(observation.fighters.every((fighter) => Number.isFinite(fighter.position.x))).toBe(true);
    expect(observation.fighters.every((fighter) => fighter.decisionCount > 0)).toBe(true);
  });

  it('restarts with fresh physics, sensor, Brain, energy, and damage state', async () => {
    const first = await createArenaSession();
    for (let i = 0; i < 60; i += 1) first.world.stepOnce();
    const next = await createArenaSession();
    expect(next.world.tick).toBe(0);
    expect(next.world.inspectEnergy('leopard-a')!.consumedEnergyJ).toBe(0);
    expect(next.agents.get('leopard-a')!.inspectDecisionHistory()).toEqual([]);
    expect(next.observer.observe(next.world).fighters.every((fighter) => fighter.fracturedParts === 0)).toBe(true);
    expect(next.world.readSensorRuntime('leopard-a')).not.toBe(first.world.readSensorRuntime('leopard-a'));
  });
});
