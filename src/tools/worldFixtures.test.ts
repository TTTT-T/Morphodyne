import { describe, expect, it } from 'vitest';
import { createDamageState } from '../core/damage';
import { validateBlueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { JointActuatorRuntime } from '../simulation/JointActuatorRuntime';
import { SensorRuntime } from '../simulation/SensorRuntime';
import {
  createActuatedMachineBlueprint,
  createPassiveObjectBlueprint,
  createSensorPlatformBlueprint,
} from './worldFixtures';

describe('Phase 6.5 world fixtures', () => {
  it('provides valid local Blueprints without requiring Agent systems', () => {
    const passive = createPassiveObjectBlueprint();
    const machine = createActuatedMachineBlueprint();
    const platform = createSensorPlatformBlueprint();

    for (const blueprint of [passive, machine, platform]) {
      expect(validateBlueprint(blueprint)).toEqual([]);
      for (const part of blueprint.parts) {
        expect(Math.abs(part.pose.position.x)).toBeLessThan(3);
        expect(Math.abs(part.pose.position.y)).toBeLessThan(3);
        expect(Math.abs(part.pose.position.z)).toBeLessThan(3);
      }
    }
    expect(passive.actuators).toBeUndefined();
    expect(passive.sensors).toBeUndefined();
    expect(machine.actuators).toHaveLength(1);
    expect(machine.connections).toHaveLength(1);
    expect(machine.connections[0].kind).toBe('revolute');
    expect(platform.actuators).toBeUndefined();
    expect(platform.sensors).toHaveLength(1);
    expect(platform.sensors?.[0].kind).toBe('range');
  });

  it('produces a joint result through the generic actuator runtime', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const blueprint = createActuatedMachineBlueprint();
    const body = physics.createBody({ id: 'machine', blueprint }, { x: 0, y: 2, z: 0 });
    const actuator = blueprint.actuators![0];
    if (actuator.kind === 'tension') throw new Error('Expected a joint actuator fixture');
    const runtime = new JointActuatorRuntime(blueprint, physics, body, { availablePowerWatts: 100 });
    const before = physics.readJointPosition(body, actuator.connectionId);

    runtime.step([{ actuatorId: actuator.id, value: 1 }], 1 / 60);
    physics.step(1 / 60);

    expect(physics.readJointPosition(body, actuator.connectionId)).toBeGreaterThan(before);
  });

  it('lets a sensor-only platform observe a nearby physical object', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const blueprint = createSensorPlatformBlueprint();
    const body = physics.createBody({ id: 'sensor-platform', blueprint });
    physics.createBox({
      halfExtents: { x: 0.25, y: 0.25, z: 0.25 },
      position: { x: 2, y: 1.05, z: 0 },
      dynamic: false,
    });
    const sensors = new SensorRuntime(
      blueprint,
      'sensor-platform-body',
      physics,
      body,
      () => createDamageState(blueprint),
    );

    physics.step(1 / 60);
    sensors.afterPhysicsStep(0, 1 / 60);

    const observations = sensors.readObservations().filter((observation) => observation.channel === 'range');
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.some((observation) => observation.values[3] > 1 && observation.values[3] < 3)).toBe(true);
  });
});
