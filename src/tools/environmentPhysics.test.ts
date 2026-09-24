import { describe, expect, it } from 'vitest';
import type { EnvironmentSpec } from '../core/environment';
import type { Blueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createActiveBlueprint } from './activeBody';
import { createActuatedMachineBlueprint, createPassiveObjectBlueprint, createSensorPlatformBlueprint } from './worldFixtures';

const FLOOR = { id: 'floor', halfExtents: { x: 6, y: 0.1, z: 6 },
  position: { x: 0, y: -0.1, z: 0 }, friction: 1, wetFriction: 0.04 } as const;

const kinds: { name: string; blueprint: () => Blueprint; partId: string; options?: Parameters<WorldRuntime['spawn']>[1] }[] = [
  { name: 'passive', blueprint: createPassiveObjectBlueprint, partId: 'passive-object-body' },
  { name: 'machine', blueprint: createActuatedMachineBlueprint, partId: 'machine-base',
    options: { energy: { capacityJ: 100000, maxPowerWatts: 100, efficiency: 1 }, control: () => [{ actuatorId: 'machine-hinge-actuator', value: 0.3 }] } },
  { name: 'sensor platform', blueprint: createSensorPlatformBlueprint, partId: 'sensor-platform-body' },
  { name: 'Agent', blueprint: createActiveBlueprint, partId: 'part-core',
    options: { energy: { capacityJ: 100000, maxPowerWatts: 400, efficiency: 1 }, agent: { control: () => [] } } },
];

async function makeWorld(spec: EnvironmentSpec): Promise<{ world: WorldRuntime; physics: RapierPhysicsAdapter }> {
  const physics = await RapierPhysicsAdapter.create();
  return { world: new WorldRuntime(physics, spec), physics };
}

describe('World environment physics', () => {
  it('owns surfaces and changes real contact friction with rain while keeping Part material intact', async () => {
    const { world } = await makeWorld({ surfaces: [FLOOR] });
    const surface = world.environment.listSurfaces()[0];
    expect(surface.effectiveFriction).toBe(1);
    world.environment.setWeather('rain');
    expect(world.environment.listSurfaces()[0].effectiveFriction).toBe(0.04);
    expect(world.environment.state.weather).toBe('rain');
    const blueprint = createPassiveObjectBlueprint();
    expect(blueprint.materials[0].friction).toBe(0.75);
    world.spawn({ id: 'object', blueprint });
    expect(world.inspectPartEnvironment('object', 'passive-object-body').surfaceIds).toEqual(['floor']);
    world.environment.setWeather('clear');
    expect(world.environment.listSurfaces()[0].effectiveFriction).toBe(1);
  });

  it('applies the same buoyancy, drag, and directional force path to every Part kind', async () => {
    const water: EnvironmentSpec = { volumes: [{ id: 'water', min: { x: -20, y: -10, z: -20 },
      max: { x: 20, y: 10, z: 20 }, density: 8, drag: 2 }],
    fields: [{ id: 'wind', force: { x: 2, y: 0, z: 0 } }] };
    for (const kind of kinds) {
      const wet = await makeWorld(water);
      const dry = await makeWorld({});
      const entity = { id: kind.name, blueprint: kind.blueprint() };
      wet.world.spawn(entity, kind.options);
      dry.world.spawn(entity, kind.options);
      wet.world.stepOnce();
      dry.world.stepOnce();
      const wetPose = wet.world.readPartPose(entity.id, kind.partId).position;
      const dryPose = dry.world.readPartPose(entity.id, kind.partId).position;
      expect(wetPose.y, `${kind.name} buoyancy`).toBeGreaterThan(dryPose.y);
      expect(wetPose.x, `${kind.name} directional force`).toBeGreaterThan(dryPose.x);
      expect(wet.world.inspectPartEnvironment(entity.id, kind.partId)).toMatchObject({
        volumeIds: ['water'], fieldIds: ['wind'],
      });
    }
  });

  it('changes passive, machine, and Agent contact outcomes through surface friction and rain', async () => {
    for (const kind of kinds.filter((candidate) => candidate.name !== 'sensor platform')) {
      const slide = async (condition: 'dry' | 'slippery' | 'rain'): Promise<number> => {
        const { world } = await makeWorld({ surfaces: [{ ...FLOOR, id: 'incline',
          halfExtents: { x: 8, y: 0.1, z: 5 }, position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: Math.sin(Math.PI / 12), w: Math.cos(Math.PI / 12) },
          friction: condition === 'slippery' ? 0.02 : 1.5, wetFriction: 0.02 }] });
        if (condition === 'rain') world.environment.setWeather('rain');
        world.spawn({ id: 'subject', blueprint: kind.blueprint() }, {
          ...kind.options, origin: { x: 0, y: 0.7, z: 0 },
        });
        for (let i = 0; i < 120; i += 1) world.stepOnce();
        return world.readPartPose('subject', kind.partId).position.x;
      };
      const dryX = await slide('dry');
      const slipperyX = await slide('slippery');
      const wetX = await slide('rain');
      expect(slipperyX, `${kind.name}: slippery contact should slide farther downhill`).toBeLessThan(dryX - 0.2);
      expect(wetX, `${kind.name}: wet surface should slide farther downhill than dry`).toBeLessThan(dryX - 0.2);
    }
  });

  it('damps physical velocity through submerged drag', async () => {
    const run = async (drag: number): Promise<number> => {
      const { world, physics } = await makeWorld({ volumes: [{ id: 'water', min: { x: -20, y: -20, z: -20 },
        max: { x: 20, y: 20, z: 20 }, density: 0, drag }] });
      world.spawn({ id: 'block', blueprint: createPassiveObjectBlueprint() });
      const handle = world.getPhysicsBody('block').partHandles.get('passive-object-body')!;
      physics.applyImpulse(handle, { x: 3, y: 0, z: 0 });
      for (let i = 0; i < 30; i += 1) world.stepOnce();
      return physics.readLinearVelocity(handle).x;
    };
    expect(await run(12)).toBeLessThan((await run(0)) * 0.5);
  });

  it('uses tilted collider geometry and gravity for a passive slope result', async () => {
    const { world } = await makeWorld({ surfaces: [{ id: 'slope', halfExtents: { x: 5, y: 0.1, z: 3 },
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: Math.sin(0.2), w: Math.cos(0.2) },
      friction: 0.05 }] });
    world.spawn({ id: 'block', blueprint: createPassiveObjectBlueprint({ halfExtents: { x: 0.25, y: 0.25, z: 0.25 } }) },
      { origin: { x: 0, y: 1.2, z: 0 } });
    for (let i = 0; i < 180; i += 1) world.stepOnce();
    expect(world.readPartPose('block', 'passive-object-body').position.x).toBeLessThan(-0.2);
    expect(world.environment.listSurfaces()[0].rotation?.z).toBeCloseTo(Math.sin(0.2));
  });

  it('stores daylight as world state without injecting an Agent penalty', async () => {
    const { world } = await makeWorld({ state: { weather: 'clear', timeOfDay: 12 } });
    const noon = world.environment.state.daylightFactor;
    world.environment.setTimeOfDay(0);
    expect(world.environment.state.daylightFactor).toBeLessThan(noon);
    expect(world.environment.state.timeOfDay).toBe(0);
  });
});
