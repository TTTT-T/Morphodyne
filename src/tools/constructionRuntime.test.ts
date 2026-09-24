import { describe, expect, it } from 'vitest';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createActiveBlueprint } from './activeBody';
import { createActuatedMachineBlueprint, createPassiveObjectBlueprint, createSensorPlatformBlueprint } from './worldFixtures';

describe('ConstructionRuntime', () => {
  it('adds, edits, detaches, and reattaches physical structure with stable world ownership', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const construction = new ConstructionRuntime(world);
    construction.spawn({ id: 'assembly', blueprint: createPassiveObjectBlueprint() });
    const original = construction.inspect('assembly').blueprint.parts[0];
    construction.addPart('assembly', {
      ...original, id: 'extension', pose: { ...original.pose, position: { x: 1.3, y: 0.5, z: 0 } },
    });
    expect(world.listComponents()).toHaveLength(2);
    construction.addConnection('assembly', {
      id: 'bridge', kind: 'rigid', fromPartId: original.id, toPartId: 'extension',
      fromAnchor: { x: 0.65, y: 0, z: 0 }, toAnchor: { x: -0.65, y: 0, z: 0 },
    });
    expect(world.inspectEntity('assembly')?.componentIds).toHaveLength(1);
    const modified = { ...original, mass: 8, geometry: { kind: 'box' as const, halfExtents: { x: 0.65, y: 0.5, z: 0.65 } } };
    construction.updatePart('assembly', modified);
    expect(construction.inspect('assembly').blueprint.parts[0].mass).toBe(8);
    construction.detach('assembly', 'bridge');
    const fragment = world.listComponents().find((component) => component.partIds.includes('extension'))!;
    expect(fragment.detached).toBe(true);
    expect(fragment.sourceEntityId).toBe('assembly');
    expect(construction.listDetachedConnections('assembly').map((connection) => connection.id)).toEqual(['bridge']);
    construction.reattach('assembly', 'bridge');
    expect(world.inspectEntity('assembly')?.componentIds).toHaveLength(1);
    expect(construction.listDetachedConnections('assembly')).toHaveLength(0);
    construction.removePart('assembly', 'extension');
    expect(world.inspectEntity('assembly')?.partIds).toEqual([original.id]);
  });

  it('validates before mutation, roundtrips Blueprints, and edits optional systems generically', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const construction = new ConstructionRuntime(world);
    const machine = createActuatedMachineBlueprint();
    construction.spawn({ id: 'machine', blueprint: machine }, {
      energy: { availablePowerWatts: 100 }, control: () => [{ actuatorId: 'machine-hinge-actuator', value: 1 }],
    });
    const machineBody = world.getPhysicsBody('machine');
    world.stepOnce();
    expect(physics.readJointPosition(machineBody, 'machine-hinge')).toBeGreaterThan(0);
    construction.removeActuator('machine', 'machine-hinge-actuator');
    expect(world.inspectEntity('machine')?.actuatorIds).toHaveLength(0);
    construction.addActuator('machine', machine.actuators![0]);
    expect(world.inspectEntity('machine')?.actuatorIds).toEqual(['machine-hinge-actuator']);

    construction.spawn({ id: 'platform', blueprint: createSensorPlatformBlueprint() });
    const sensor = construction.inspect('platform').blueprint.sensors![0];
    construction.removeSensor('platform', sensor.id);
    expect(world.inspectEntity('platform')?.sensorIds).toHaveLength(0);
    construction.addSensor('platform', sensor);
    expect(world.inspectEntity('platform')?.sensorIds).toEqual([sensor.id]);
    const saved = construction.saveBlueprint('platform');
    expect(construction.loadBlueprint(saved)).toEqual(construction.inspect('platform').blueprint);

    const prior = construction.saveBlueprint('platform');
    expect(() => construction.addPart('platform', {
      ...construction.inspect('platform').blueprint.parts[0], id: 'invalid', mass: -1,
    })).toThrow(/Invalid Blueprint/);
    expect(construction.saveBlueprint('platform')).toBe(prior);
    expect(() => construction.loadBlueprint('{"parts": []}')).toThrow(/materials, parts, and connections/);

    construction.spawn({ id: 'agent', blueprint: createActiveBlueprint() }, {
      energy: { availablePowerWatts: 400 }, agent: { control: () => [] },
    });
    expect(construction.inspect('agent').entity.agentPresent).toBe(true);
    expect(construction.inspect('agent').components.length).toBeGreaterThan(0);
  });

  it('repairs a physically separated assembly through explicit reconstruction', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const construction = new ConstructionRuntime(world);
    construction.spawn({ id: 'damaged', blueprint: createActiveBlueprint() });
    construction.applyImpact('damaged', 'part-1-a', { x: 0, y: 0, z: -3 });
    construction.applyImpact('damaged', 'part-core', { x: 0, y: 0, z: 3 });
    world.stepOnce();
    expect(construction.inspect('damaged').damage.connections['connection-0-a'].connected).toBe(false);
    expect(world.inspectEntity('damaged')!.componentIds.length).toBeGreaterThan(1);
    const before = world.listComponents().find((component) => component.partIds.includes('part-1-a'))!;
    const pose = world.readPartPose(before.id, 'part-1-a');
    const existingSensor = construction.inspect('damaged').blueprint.sensors![0];
    construction.addSensor('damaged', { ...existingSensor, id: 'additional-sensor' });
    expect(construction.inspect('damaged').damage.connections['connection-0-a'].connected).toBe(false);
    expect(world.getPhysicsBody('damaged').connectionHandles.has('connection-0-a')).toBe(false);
    construction.repair('damaged');
    expect(construction.inspect('damaged').damage.connections['connection-0-a'].connected).toBe(true);
    expect(world.getPhysicsBody('damaged').connectionHandles.has('connection-0-a')).toBe(true);
    expect(world.inspectEntity('damaged')!.componentIds).toHaveLength(1);
    const repairedPose = world.readPartPose('damaged', 'part-1-a');
    expect(repairedPose.position.x).toBeCloseTo(pose.position.x);
    expect(repairedPose.position.y).toBeCloseTo(pose.position.y);
    expect(repairedPose.position.z).toBeCloseTo(pose.position.z);
  });
});
