import { describe, expect, it } from 'vitest';
import { createControlSignal } from '../core/actuation';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ActiveBodyController, type JointFeedback } from '../simulation/ActiveBodyController';
import { BrainRuntime } from '../simulation/BrainRuntime';
import { EnergyRuntime } from '../simulation/EnergyRuntime';
import { JointActuatorRuntime } from '../simulation/JointActuatorRuntime';
import { SensorRuntime } from '../simulation/SensorRuntime';
import { SkillRuntime } from '../simulation/SkillRuntime';
import { StructuralDamageRuntime } from '../simulation/StructuralDamageRuntime';
import { createActiveBlueprint, getActiveBodyAssemblies } from './activeBody';

const STEP = 1 / 60;

async function createTrial() {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
  const blueprint = createActiveBlueprint();
  const body = physics.createBody({ id: 'skill-trial', blueprint });
  const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
  const assemblies = getActiveBodyAssemblies();
  const groups = assemblies.map((assembly, index) => {
    const position = parts.get(assembly.partIds[0])!.pose.position;
    const phase = index === 0 || index === 3 ? 0 : Math.PI;
    return { actuatorIds: assembly.connectionIds.slice(0, 2).map((id) => `actuator-${id}`),
      x: position.x, z: position.z, phaseOffsets: [phase, phase + Math.PI / 2] };
  });
  const controller = ActiveBodyController.fromGroups(groups,
    { standingGain: 0.01, standingDampingGain: 0, jointPositionGain: 3, jointVelocityGain: 0.6, turnGain: 0 });
  const actuators = new JointActuatorRuntime(blueprint, physics, body, new EnergyRuntime({ capacityJ: 100000, maxPowerWatts: 400, efficiency: 1 }));
  const damage = new StructuralDamageRuntime(blueprint, physics, body);
  const sensors = new SensorRuntime(blueprint, 'part-core', physics, body, () => damage.state, () => 0.5);
  const brain = new BrainRuntime();
  const skill = new SkillRuntime();
  let tick = 0;
  let lastExperienceTick = -1;
  const records: { tick: number; prediction: number; observed: number; error: number;
    amplitude: number; phaseOffset: number; adaptations: number; z: number }[] = [];

  function step() {
    const view = sensors.readAgentView();
    if (view.tick >= 0) {
      const brainState = brain.update(view);
      const skillState = skill.update(brainState);
      const intent = skillState.control;
      const joints = new Map<string, JointFeedback>();
      for (const measured of view.perceptions) {
        if (measured.channel !== 'joint' || !measured.ownConnectionId) continue;
        joints.set(`actuator-${measured.ownConnectionId}`,
          { angle: measured.values[0], angularVelocity: measured.values[1] });
      }
      const orientation = view.perceptions.find((entry) => entry.sensorId === 'sensor-core-internal' && entry.channel === 'orientation');
      const angular = view.perceptions.find((entry) => entry.sensorId === 'sensor-core-internal' && entry.channel === 'angular-velocity');
      const pose = { position: { x: 0, y: 0, z: 0 },
        rotation: orientation ? { x: orientation.values[0], y: orientation.values[1], z: orientation.values[2], w: orientation.values[3] }
          : { x: 0, y: 0, z: 0, w: 1 } };
      const signals = controller.update(STEP, pose, intent, { joints,
        ...(angular ? { bodyAngularVelocity: { x: angular.values[0], y: angular.values[1], z: angular.values[2] } } : {}),
      });
      const driveSignals = assemblies.map((assembly) => {
        const x = parts.get(assembly.partIds[0])!.pose.position.x;
        return createControlSignal(`actuator-${assembly.connectionIds[2]}`,
          Math.max(-1, Math.min(1, 0.03 * intent.forward * (intent.amplitude ?? 1) + intent.turn * Math.sign(x))));
      });
      actuators.step([...signals, ...driveSignals, createControlSignal('actuator-connection-4', intent.turn)], STEP);
      const experience = skillState.lastExperience;
      if (experience && experience.tick !== lastExperienceTick) {
        lastExperienceTick = experience.tick;
        records.push({ tick: experience.tick, prediction: experience.prediction.forwardProgress,
          observed: experience.observation?.forwardProgress ?? NaN,
          error: experience.error.forwardProgress, amplitude: experience.parameters.amplitude,
          phaseOffset: experience.parameters.phaseOffset, adaptations: skillState.adaptationCount,
          z: body.readPartPose('part-core').position.z });
      }
    }
    physics.step(STEP);
    damage.afterPhysicsStep(tick);
    sensors.afterPhysicsStep(tick, STEP);
    tick += 1;
  }

  function impact() {
    const mounted = body.partHandles.get(assemblies[0].partIds[0])!;
    physics.applyImpulse(mounted, { x: 0, y: 0, z: -3 });
    physics.applyImpulse(body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
  }
  return { step, impact, records, damage, body };
}

describe('Phase 6 physical adaptation', () => {
  it('changes a Forward motor attempt after a real structural separation and measured prediction error', async () => {
    const trial = await createTrial();
    for (let tick = 0; tick < 250; tick++) trial.step();
    const before = [...trial.records];
    expect(trial.damage.state.connections['connection-0-a'].connected).toBe(true);
    trial.impact();
    for (let tick = 0; tick < 360; tick++) trial.step();
    const after = trial.records.slice(before.length);
    expect(before.length).toBeGreaterThan(6);
    expect(trial.damage.state.connections['connection-0-a'].connected).toBe(false);
    expect(after.length).toBeGreaterThan(2);
    const stable = before.slice(-3);
    const oldAmplitude = stable[0].amplitude;
    expect(stable.every((entry) => entry.amplitude === oldAmplitude)).toBe(true);
    const oldProgress = stable.slice(-2).reduce((sum, entry) => sum + entry.observed, 0) / 2;
    const damagedAtOldParameters = after.filter((entry) => entry.amplitude === oldAmplitude).slice(0, 2);
    expect(damagedAtOldParameters).toHaveLength(2);
    const damagedProgress = damagedAtOldParameters.reduce((sum, entry) => sum + entry.observed, 0) / 2;
    expect(damagedProgress).toBeLessThan(oldProgress - 0.05);
    const normalError = stable.slice(-2).reduce((sum, entry) => sum + Math.abs(entry.error), 0) / 2;
    const damagedError = damagedAtOldParameters.reduce((sum, entry) => sum + Math.abs(entry.error), 0) / 2;
    expect(damagedError).toBeGreaterThan(normalError * 2);
    const adjusted = after.filter((entry) => entry.amplitude > oldAmplitude);
    expect(adjusted.length).toBeGreaterThan(0);
    expect(adjusted[0].adaptations).toBeGreaterThan(stable[0].adaptations);
    expect(Math.max(...adjusted.map((entry) => entry.observed))).toBeGreaterThan(damagedProgress + 0.05);
  });
});
