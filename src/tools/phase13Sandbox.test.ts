import { describe, expect, it } from 'vitest';
import type { TensionActuator } from '../core/actuation';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { ManualControlSource } from './ManualControlSource';
import { createTensionMechanismBlueprint } from './sandboxBlueprintCatalog';

const supply = { capacityJ: 1000, maxPowerWatts: 150, efficiency: 0.8 } as const;

async function createTrial() {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics);
  const construction = new ConstructionRuntime(world);
  const manual = new ManualControlSource();
  construction.spawn({ id: 'tension', blueprint: createTensionMechanismBlueprint() },
    { energy: supply, control: manual.control });
  return { world, construction, manual };
}

describe('Phase 13 sandbox runtime boundaries', () => {
  it('sends manual signals through finite Energy and physical motion', async () => {
    const { world, manual } = await createTrial();
    manual.set('tension-pull', 'tension', 1);
    const start = world.readPartPose('tension', 'tension-arm').position;
    for (let i = 0; i < 150; i += 1) world.stepOnce();
    const end = world.readPartPose('tension', 'tension-arm').position;
    const energy = world.inspectEnergy('tension')!;
    expect(Math.abs(end.x - start.x)).toBeGreaterThan(0.2);
    expect(energy.consumedEnergyJ).toBeGreaterThan(0);
    expect(energy.remainingEnergyJ).toBeLessThan(energy.capacityJ);
    expect(energy.maxPowerWatts).toBe(supply.maxPowerWatts);
    expect(world.readConnectionLoad('tension', 'tension-hinge')).toBeDefined();
    expect(world.readPartVelocity('tension', 'tension-arm')).toBeDefined();
  });

  it('round trips Tension attachments through Construction without refilling Energy', async () => {
    const { world, construction, manual } = await createTrial();
    manual.set('tension-pull', 'tension', 1);
    for (let i = 0; i < 90; i += 1) world.stepOnce();
    const before = world.inspectEnergy('tension')!;
    const blueprint = construction.inspect('tension').blueprint;
    const original = blueprint.actuators![0] as TensionActuator;
    const revised: TensionActuator = { ...original, fromAttachment: { x: 0.1, y: -0.55, z: 0 } };
    construction.replaceBlueprint('tension', { ...blueprint, actuators: [revised] });
    expect(construction.inspect('tension').blueprint.actuators![0]).toEqual(revised);
    expect(world.inspectEnergy('tension')).toEqual(before);
    expect(world.readPartPose('tension', 'tension-arm').position.x).toBeTypeOf('number');
  });

  it('reset uses World removal and Construction spawn with a fresh finite supply', async () => {
    const { world, construction, manual } = await createTrial();
    manual.set('tension-pull', 'tension', 1);
    for (let i = 0; i < 90; i += 1) world.stepOnce();
    expect(world.inspectEnergy('tension')!.consumedEnergyJ).toBeGreaterThan(0);
    world.removeEntity('tension');
    const freshManual = new ManualControlSource();
    construction.spawn({ id: 'tension-reset', blueprint: createTensionMechanismBlueprint() },
      { energy: supply, control: freshManual.control });
    expect(world.inspectEnergy('tension-reset')!.remainingEnergyJ).toBe(supply.capacityJ);
    expect(freshManual.control(1 / 60, 0)).toEqual([]);
    expect(world.listEntities().map((entity) => entity.id)).toEqual(['tension-reset']);
  });
});
