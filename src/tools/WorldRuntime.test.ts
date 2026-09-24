import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createActiveBlueprint } from './activeBody';
import { createPassiveBlueprint } from './smokeScene';
import { createActuatedMachineBlueprint, createPassiveObjectBlueprint, createSensorPlatformBlueprint } from './worldFixtures';

describe('WorldRuntime', () => {
  it('runs passive, actuated, sensor-only, and Agent compositions in one world', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    world.spawn({ id: 'platform', blueprint: createSensorPlatformBlueprint() });
    world.spawn({ id: 'object', blueprint: createPassiveObjectBlueprint() }, { origin: { x: 2, y: 0.55, z: 0 } });
    world.spawn({ id: 'machine', blueprint: createActuatedMachineBlueprint() }, {
      origin: { x: -3, y: 2, z: 0 }, energy: { availablePowerWatts: 100 },
      control: () => [{ actuatorId: 'machine-hinge-actuator', value: 1 }],
    });
    world.spawn({ id: 'agent', blueprint: createActiveBlueprint() }, {
      origin: { x: 0, y: 0, z: 5 }, energy: { availablePowerWatts: 400 },
      agent: { control: () => [] },
    });
    const machine = world.getPhysicsBody('machine');
    const before = physics.readJointPosition(machine, 'machine-hinge');
    world.stepOnce();
    expect(world.listEntities()).toHaveLength(4);
    expect(world.inspectEntity('object')?.agentPresent).toBe(false);
    expect(world.inspectEntity('machine')?.agentPresent).toBe(false);
    expect(world.inspectEntity('platform')?.agentPresent).toBe(false);
    expect(world.inspectEntity('agent')?.agentPresent).toBe(true);
    expect(physics.readJointPosition(machine, 'machine-hinge')).toBeGreaterThan(before);
    expect(world.readObservations('platform').some((observation) => observation.channel === 'range')).toBe(true);
  });

  it('owns multiple stable Entity lifecycles without Agent composition', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    world.spawn({ id: 'one', blueprint: createPassiveBlueprint() });
    world.spawn({ id: 'two', blueprint: createPassiveBlueprint() }, { origin: { x: 4, y: 0, z: 0 } });
    expect(world.listEntities().map((entity) => entity.id)).toEqual(['one', 'two']);
    expect(world.inspectEntity('one')?.agentPresent).toBe(false);
    expect(world.inspectEntity('two')?.partIds).toHaveLength(5);
    world.stepOnce();
    expect(world.tick).toBe(1);
    world.removeEntity('one');
    expect(world.listEntities().map((entity) => entity.id)).toEqual(['two']);
    expect(() => world.spawn({ id: 'one', blueprint: createPassiveBlueprint() })).toThrow(/reused/);
    world.stepOnce();
    expect(world.readPartPose('two', 'part-0').position.y).toBeGreaterThan(0);
  });

  it('tracks a physically separated component with its own world identity and removal', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    world.spawn({ id: 'structure', blueprint: createActiveBlueprint() });
    const body = world.getPhysicsBody('structure');
    physics.applyImpulse(body.partHandles.get('part-1-a')!, { x: 0, y: 0, z: -3 });
    physics.applyImpulse(body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
    world.stepOnce();
    expect(world.getDamageRuntime('structure').state.connections['connection-0-a'].connected).toBe(false);
    const fragment = world.listComponents().find((component) => component.detached && component.partIds.includes('part-1-a'));
    expect(fragment).toBeDefined();
    expect(fragment?.sourceEntityId).toBe('structure');
    expect(fragment?.separatedBy).toEqual({ connectionId: 'connection-0-a', tick: 0 });
    expect(fragment?.partIds).toEqual(['part-1-a', 'part-1-b', 'part-1-c']);
    expect(world.inspectComponent(fragment!.id)).toEqual(fragment);
    expect(world.readPartPose(fragment!.id, 'part-1-a').position).toBeDefined();
    world.removeComponent(fragment!.id);
    expect(world.inspectComponent(fragment!.id)).toBeUndefined();
    expect(world.inspectEntity('structure')?.partIds).not.toContain('part-1-a');
    world.stepOnce();
    expect(world.readPartPose('structure', 'part-core').position).toBeDefined();
  });
});
