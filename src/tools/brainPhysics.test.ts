import { describe, expect, it } from 'vitest';
import { createControlSignal } from '../core/actuation';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { BrainRuntime, skillIntentToControlIntent } from '../simulation/BrainRuntime';
import { JointActuatorRuntime } from '../simulation/JointActuatorRuntime';
import { SensorRuntime } from '../simulation/SensorRuntime';
import { StructuralDamageRuntime } from '../simulation/StructuralDamageRuntime';
import { createActiveBlueprint } from './activeBody';

const STEP = 1 / 60;

async function setup(withRangeSensor = true, availablePowerWatts = 400) {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
  const fullBlueprint = createActiveBlueprint();
  const blueprint = withRangeSensor ? fullBlueprint : {
    ...fullBlueprint, sensors: fullBlueprint.sensors?.filter((sensor) => sensor.kind !== 'range'),
  };
  const body = physics.createBody({ id: 'agent', blueprint });
  const damage = new StructuralDamageRuntime(blueprint, physics, body);
  const sensors = new SensorRuntime(blueprint, 'part-core', physics, body, () => damage.state, () => 0.5);
  const brain = new BrainRuntime();
  const actuators = new JointActuatorRuntime(blueprint, physics, body, { availablePowerWatts });
  function step(tick: number) {
    physics.step(STEP);
    damage.afterPhysicsStep(tick);
    sensors.afterPhysicsStep(tick, STEP);
    return brain.update(sensors.readAgentView());
  }
  return { physics, body, damage, sensors, brain, actuators, step };
}

describe('Phase 5 physical brain loop', () => {
  it('uses an anonymous range return to select Turn, then a real actuator and Rapier produce measured joint motion', async () => {
    const trial = await setup();
    trial.physics.createBox({ halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
      position: { x: -0.85, y: 1, z: -2.5 }, dynamic: false });
    const initial = trial.step(0);
    expect(initial.worldModel.ranges.length).toBeGreaterThan(0);
    expect(initial.decision?.goal.kind).toBe('increase-distance');
    expect(initial.skillIntent.skill).toBe('turn');
    const control = skillIntentToControlIntent(initial.skillIntent);
    trial.actuators.step([createControlSignal('actuator-connection-4', control.turn)], STEP);
    const after = trial.step(1);
    const sensedRotor = after.selfModel.joints.find((joint) => joint.connectionId === 'connection-4');
    expect(sensedRotor).toBeDefined();
    expect(Math.abs(sensedRotor!.value[1])).toBeGreaterThan(0);
  });

  it('does not guarantee a physical result from the same goal and skill attempt', async () => {
    async function attempt(availablePowerWatts: number) {
      const trial = await setup(true, availablePowerWatts);
      trial.physics.createBox({ halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
        position: { x: -0.85, y: 1, z: -2.5 }, dynamic: false });
      const selected = trial.step(0);
      const control = skillIntentToControlIntent(selected.skillIntent);
      trial.actuators.step([createControlSignal('actuator-connection-4', control.turn)], STEP);
      const observed = trial.step(1).selfModel.joints.find((joint) => joint.connectionId === 'connection-4');
      return { goal: selected.decision?.goal.kind, skill: selected.skillIntent.skill,
        measuredJointVelocity: observed?.value[1] ?? NaN };
    }
    const powered = await attempt(400);
    const unpowered = await attempt(0);
    expect(powered.goal).toBe('increase-distance');
    expect(unpowered.goal).toBe(powered.goal);
    expect(unpowered.skill).toBe(powered.skill);
    expect(Math.abs(powered.measuredJointVelocity)).toBeGreaterThan(Math.abs(unpowered.measuredJointVelocity));
  });

  it('forgets a physical obstacle when it leaves range, and never detects it without the sensor', async () => {
    const trial = await setup();
    const target = trial.physics.createBox({ halfExtents: { x: 0.4, y: 0.4, z: 0.4 },
      position: { x: -0.85, y: 1, z: -2.5 }, dynamic: true });
    expect(trial.step(0).skillIntent.skill).toBe('turn');
    trial.physics.applyImpulse(target, { x: 0, y: 0, z: -50 });
    let final = trial.step(1);
    for (let tick = 2; tick <= 6; tick++) final = trial.step(tick);
    expect(trial.physics.readPose(target).position.z).toBeLessThan(-6);
    expect(final.worldModel.ranges).toHaveLength(0);
    expect(final.decision?.goal.kind).toBe('continue-exploration');
    expect(final.skillIntent.skill).toBe('forward');

    const withoutRange = await setup(false);
    withoutRange.physics.createBox({ halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
      position: { x: -0.85, y: 1, z: -2.5 }, dynamic: false });
    const blind = withoutRange.step(0);
    expect(blind.worldModel.ranges).toHaveLength(0);
    expect(blind.skillIntent.skill).toBe('forward');
  });

  it('updates its body estimate after impact separates a sensed assembly without reading damage state', async () => {
    const trial = await setup();
    trial.physics.createBox({ halfExtents: { x: 0.4, y: 0.4, z: 0.4 },
      position: { x: -0.85, y: 1, z: -2.5 }, dynamic: false });
    const before = trial.step(0);
    expect(before.worldModel.ranges.length).toBeGreaterThan(0);
    const mounted = trial.body.partHandles.get('part-1-a')!;
    trial.physics.applyImpulse(mounted, { x: 0, y: 0, z: -3 });
    trial.physics.applyImpulse(trial.body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
    const after = trial.step(1);
    expect(after.selfModel.feedbackGapRecent).toBe(true);
    expect(trial.damage.state.connections['connection-0-a'].connected).toBe(false); // observer-side assertion
    expect(after.selfModel.parts.length).toBeLessThan(before.selfModel.parts.length);
    expect(after.selfModel.joints.length).toBeLessThan(before.selfModel.joints.length);
    expect(after.worldModel.ranges).toHaveLength(0);
    expect(after.selfModel.observedSensorIds).not.toContain('sensor-forward-range');
    let reconsidered = after;
    for (let tick = 2; tick <= 6; tick++) reconsidered = trial.step(tick);
    expect(reconsidered.decision?.goal.kind).toBe('maintain-stability');
    expect(reconsidered.skillIntent.skill).toBe('stand');
  });
});
