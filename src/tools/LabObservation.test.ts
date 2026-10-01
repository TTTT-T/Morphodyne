import { expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createJointMechanismBlueprint } from './sandboxBlueprintCatalog';
import { LabObservation } from './LabObservation';
import type { LabDesign } from './LabDesign';

it('observes every Part through its current component after physical separation', async () => {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics);
  const construction = new ConstructionRuntime(world);
  const original = createJointMechanismBlueprint();
  const blueprint = { ...original, connections: original.connections.map(c => ({ ...c, strengthImpulseNs: 1 })) };
  const energy = { capacityJ: 1200, maxPowerWatts: 180, efficiency: 0.8 };
  construction.spawn({ id: 'machine', blueprint }, { energy });
  const design: LabDesign = { format: 'morphodyne-lab', version: 1, name: '损伤实验', experiment: 'damage',
    environment: { weather: 'clear', timeOfDay: 12 }, timeScale: 1, impulse: { x: 3, y: 0, z: 0 },
    entities: [{ key: 'machine', blueprint, origin: { x: 0, y: 0, z: 0 }, energy, controls: {} }] };
  const observation = new LabObservation();
  observation.begin(world, construction, design);
  construction.applyImpact('machine', 'joint-arm', design.impulse);
  world.stepOnce();
  observation.sample(world, construction);
  const result = observation.read(world, construction, design);
  expect(world.inspectEntity('machine')!.componentIds).toHaveLength(2);
  expect(result).toMatchObject({ seconds: 1 / 60, samples: 1, separated: 1, inactiveActuators: 1 });
  expect(result.parts).toHaveLength(2);
  expect(result.parts.every(p => Number.isFinite(p.height) && Number.isFinite(p.displacement))).toBe(true);
});
