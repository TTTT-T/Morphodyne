import { describe, expect, it } from 'vitest';
import { createControlSignal } from '../core/actuation';
import type { EnvironmentSpec } from '../core/environment';
import { SkillAdaptationPolicy } from '../core/skillAdaptation';
import type { Blueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ActiveBodyController, type JointFeedback } from '../simulation/ActiveBodyController';
import { BrainRuntime } from '../simulation/BrainRuntime';
import { EnergyRuntime } from '../simulation/EnergyRuntime';
import { JointActuatorRuntime } from '../simulation/JointActuatorRuntime';
import { SensorRuntime } from '../simulation/SensorRuntime';
import { SkillRuntime } from '../simulation/SkillRuntime';
import { StructuralDamageRuntime } from '../simulation/StructuralDamageRuntime';
import { WorldRuntime, type SpawnOptions } from '../simulation/WorldRuntime';
import { createActiveBlueprint, getActiveBodyAssemblies } from './activeBody';
import { createActuatedMachineBlueprint, createPassiveObjectBlueprint } from './worldFixtures';

const STEP = 1 / 60;

describe('Phase 8 core causal validation', () => {
  it('shows capability emerging from structural composition and control', async () => {
    const physics = await RapierPhysicsAdapter.create();
    const world = new WorldRuntime(physics);
    const passive = { id: 'passive', blueprint: createPassiveObjectBlueprint() };
    const machine = { id: 'machine', blueprint: createActuatedMachineBlueprint() };
    const heavyMachine = { id: 'heavy-machine', blueprint: {
      ...machine.blueprint,
      id: 'blueprint-heavy-machine',
      parts: machine.blueprint.parts.map((part) => part.id === 'machine-arm' ? { ...part, mass: 4 } : part),
    } };
    const agent = { id: 'agent', blueprint: createActiveBlueprint() };

    world.spawn(passive);
    world.spawn(machine, {
      origin: { x: -3, y: 1, z: 0 },
      energy: { capacityJ: 100000, maxPowerWatts: 100, efficiency: 1 },
      control: () => [createControlSignal('machine-hinge-actuator', 1)],
    });
    world.spawn(heavyMachine, {
      origin: { x: -7, y: 1, z: 0 },
      energy: { capacityJ: 100000, maxPowerWatts: 100, efficiency: 1 },
      control: () => [createControlSignal('machine-hinge-actuator', 1)],
    });
    world.spawn(agent, {
      origin: { x: 3, y: 0, z: 0 },
      energy: { capacityJ: 100000, maxPowerWatts: 400, efficiency: 1 },
      agent: { control: () => [] },
    });

    const machineBody = world.getPhysicsBody(machine.id);
    const heavyBody = world.getPhysicsBody(heavyMachine.id);
    const before = physics.readJointPosition(machineBody, 'machine-hinge');
    world.stepOnce();
    const after = physics.readJointPosition(machineBody, 'machine-hinge');
    const passiveView = world.inspectEntity(passive.id)!;
    const machineView = world.inspectEntity(machine.id)!;
    const agentView = world.inspectEntity(agent.id)!;

    expect(passiveView.agentPresent).toBe(false);
    expect(passiveView.actuatorIds).toHaveLength(0);
    expect(machineView.agentPresent).toBe(false);
    expect(machineView.actuatorIds).toEqual(['machine-hinge-actuator']);
    expect(agentView.agentPresent).toBe(true);
    expect(agentView.sensorIds.length).toBeGreaterThan(0);
    expect(agentView.actuatorIds.length).toBeGreaterThan(0);
    expect(Math.abs(after - before)).toBeGreaterThan(1e-4);
    for (let tick = 0; tick < 11; tick += 1) world.stepOnce();
    expect(Math.abs(physics.readJointPosition(machineBody, 'machine-hinge')
      - physics.readJointPosition(heavyBody, 'machine-hinge'))).toBeGreaterThan(1e-3);
  });

  interface DamageTrial {
    readonly connected: boolean;
    readonly maximumGap: number;
  }

  async function localizedDamageTrial(withImpact: boolean): Promise<DamageTrial> {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({
      halfExtents: { x: 12, y: 0.1, z: 12 },
      position: { x: 0, y: -0.1, z: 0 },
      dynamic: false,
    });
    const blueprint = createActiveBlueprint();
    const body = physics.createBody({ id: 'damage-trial', blueprint });
    const damage = new StructuralDamageRuntime(blueprint, physics, body);
    let maximumGap = 0;

    for (let tick = 0; tick < 90; tick += 1) {
      if (withImpact && tick === 0) {
        physics.applyImpulse(body.partHandles.get('part-1-a')!, { x: 0, y: 0, z: -3 });
        physics.applyImpulse(body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
      }
      physics.step(STEP);
      damage.afterPhysicsStep(tick);
      const core = body.readPartPose('part-core').position;
      const segment = body.readPartPose('part-1-a').position;
      maximumGap = Math.max(maximumGap, Math.hypot(
        segment.x - core.x, segment.y - core.y, segment.z - core.z,
      ));
    }

    return { connected: damage.state.connections['connection-0-a'].connected, maximumGap };
  }

  it('turns localized structural damage into physical functional loss', async () => {
    const intact = await localizedDamageTrial(false);
    const damaged = await localizedDamageTrial(true);

    expect(intact.connected).toBe(true);
    expect(damaged.connected).toBe(false);
    expect(damaged.maximumGap).toBeGreaterThan(2);
    expect(damaged.maximumGap).toBeGreaterThan(intact.maximumGap + 0.8);
  });

  const sharedEnvironment: EnvironmentSpec = {
    volumes: [{
      id: 'water', min: { x: -20, y: -10, z: -20 }, max: { x: 20, y: 10, z: 20 },
      density: 8, drag: 2,
    }],
    fields: [{ id: 'wind', force: { x: 2, y: 0, z: 0 } }],
  };

  const environmentSubjects: readonly {
    readonly name: string;
    readonly build: () => Blueprint;
    readonly partId: string;
    readonly options?: SpawnOptions;
  }[] = [
    { name: 'passive', build: createPassiveObjectBlueprint, partId: 'passive-object-body' },
    {
      name: 'machine', build: createActuatedMachineBlueprint, partId: 'machine-base',
      options: {
        energy: { capacityJ: 100000, maxPowerWatts: 100, efficiency: 1 },
        control: () => [createControlSignal('machine-hinge-actuator', 0.3)],
      },
    },
    {
      name: 'agent', build: createActiveBlueprint, partId: 'part-core',
      options: { energy: { capacityJ: 100000, maxPowerWatts: 400, efficiency: 1 }, agent: { control: () => [] } },
    },
  ];

  async function makeWorld(environment: EnvironmentSpec = {}): Promise<WorldRuntime> {
    return new WorldRuntime(await RapierPhysicsAdapter.create(), environment);
  }

  it('applies shared environment forces to passive, machine, and Agent structures', async () => {
    for (const subject of environmentSubjects) {
      const wet = await makeWorld(sharedEnvironment);
      const dry = await makeWorld();
      const entity = { id: 'subject', blueprint: subject.build() };
      wet.spawn(entity, subject.options);
      dry.spawn(entity, subject.options);

      wet.stepOnce();
      dry.stepOnce();
      const wetPosition = wet.readPartPose(entity.id, subject.partId).position;
      const dryPosition = dry.readPartPose(entity.id, subject.partId).position;

      expect(wetPosition.y, `${subject.name} buoyancy`).toBeGreaterThan(dryPosition.y);
      expect(wetPosition.x, `${subject.name} field force`).toBeGreaterThan(dryPosition.x);
      expect(wet.inspectPartEnvironment(entity.id, subject.partId)).toMatchObject({
        volumeIds: ['water'], fieldIds: ['wind'],
      });
    }
  });

  interface BeliefTrial {
    readonly physics: RapierPhysicsAdapter;
    readonly step: (tick: number) => ReturnType<BrainRuntime['update']>;
  }

  async function makeBeliefTrial(withRangeSensor = true): Promise<BeliefTrial> {
    const physics = await RapierPhysicsAdapter.create();
    const fullBlueprint = createActiveBlueprint();
    const blueprint = withRangeSensor ? fullBlueprint : {
      ...fullBlueprint,
      sensors: fullBlueprint.sensors?.filter((sensor) => sensor.kind !== 'range'),
    };
    const body = physics.createBody({ id: 'belief-agent', blueprint });
    const damage = new StructuralDamageRuntime(blueprint, physics, body);
    const sensors = new SensorRuntime(blueprint, 'part-core', physics, body, () => damage.state);
    const brain = new BrainRuntime();

    return {
      physics,
      step: (tick) => {
        physics.step(STEP);
        damage.afterPhysicsStep(tick);
        sensors.afterPhysicsStep(tick, STEP);
        return brain.update(sensors.readAgentView());
      },
    };
  }

  it('changes Agent behavior when a target leaves current sensory evidence', async () => {
    const trial = await makeBeliefTrial();
    const target = trial.physics.createBox({
      halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
      position: { x: -0.85, y: 1, z: -2.5 },
      dynamic: true,
    });
    const initial = trial.step(0);
    expect(initial.worldModel.ranges.length).toBeGreaterThan(0);
    expect(initial.skillIntent.skill).toBe('turn');

    trial.physics.applyImpulse(target, { x: 0, y: 0, z: -50 });
    let current = initial;
    for (let tick = 1; tick <= 6; tick += 1) current = trial.step(tick);

    expect(trial.physics.readPose(target).position.z).toBeLessThan(-6);
    expect(current.worldModel.ranges).toHaveLength(0);
    expect(current.decision?.goal.kind).toBe('continue-exploration');
    expect(current.skillIntent.skill).toBe('forward');

    const blind = await makeBeliefTrial(false);
    blind.physics.createBox({
      halfExtents: { x: 0.35, y: 0.35, z: 0.35 },
      position: { x: -0.85, y: 1, z: -2.5 },
      dynamic: false,
    });
    const withoutSensor = blind.step(0);
    expect(withoutSensor.worldModel.ranges).toHaveLength(0);
    expect(withoutSensor.skillIntent.skill).toBe('forward');
  });

  interface AdaptationRecord {
    readonly prediction: number;
    readonly observed: number;
    readonly error: number;
    readonly amplitude: number;
    readonly adaptations: number;
  }

  async function createAdaptationTrial() {
    const physics = await RapierPhysicsAdapter.create();
    physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
    const blueprint = createActiveBlueprint();
    const body = physics.createBody({ id: 'adaptation-trial', blueprint });
    const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
    const assemblies = getActiveBodyAssemblies();
    const groups = assemblies.map((assembly, index) => {
      const position = parts.get(assembly.partIds[0])!.pose.position;
      const phase = index === 0 || index === 3 ? 0 : Math.PI;
      return {
        actuatorIds: assembly.connectionIds.slice(0, 2).map((id) => `actuator-${id}`),
        x: position.x, z: position.z, phaseOffsets: [phase, phase + Math.PI / 2],
      };
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
    const records: AdaptationRecord[] = [];

    function step(): void {
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
        const orientation = view.perceptions.find((entry) =>
          entry.sensorId === 'sensor-core-internal' && entry.channel === 'orientation');
        const angular = view.perceptions.find((entry) =>
          entry.sensorId === 'sensor-core-internal' && entry.channel === 'angular-velocity');
        const pose = {
          position: { x: 0, y: 0, z: 0 },
          rotation: orientation
            ? { x: orientation.values[0], y: orientation.values[1], z: orientation.values[2], w: orientation.values[3] }
            : { x: 0, y: 0, z: 0, w: 1 },
        };
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
          records.push({
            prediction: experience.prediction.forwardProgress,
            observed: experience.observation?.forwardProgress ?? NaN,
            error: experience.error.forwardProgress,
            amplitude: experience.parameters.amplitude,
            adaptations: skillState.adaptationCount,
          });
        }
      }
      physics.step(STEP);
      damage.afterPhysicsStep(tick);
      sensors.afterPhysicsStep(tick, STEP);
      tick += 1;
    }

    function impact(): void {
      const mounted = body.partHandles.get(assemblies[0].partIds[0])!;
      physics.applyImpulse(mounted, { x: 0, y: 0, z: -3 });
      physics.applyImpulse(body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
    }

    return { step, impact, records, damage };
  }

  it('adapts an existing Skill after structural damage creates prediction error', async () => {
    const trial = await createAdaptationTrial();
    for (let tick = 0; tick < 250; tick += 1) trial.step();
    const before = [...trial.records];
    expect(trial.damage.state.connections['connection-0-a'].connected).toBe(true);

    trial.impact();
    for (let tick = 0; tick < 360; tick += 1) trial.step();
    const after = trial.records.slice(before.length);
    expect(trial.damage.state.connections['connection-0-a'].connected).toBe(false);
    expect(before.length).toBeGreaterThan(6);
    expect(after.length).toBeGreaterThan(2);

    const stable = before.slice(-3);
    const oldAmplitude = stable[0].amplitude;
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

    const measuredEvidence = damagedAtOldParameters.map((entry) => ({
      parameters: { amplitude: entry.amplitude, phaseOffset: 0 },
      predictedProgress: entry.prediction,
      observedProgress: entry.observed,
      confidence: 1,
    }));
    const policyAdjustment = new SkillAdaptationPolicy().adjust(
      { amplitude: oldAmplitude, phaseOffset: 0 }, measuredEvidence,
    );
    expect(policyAdjustment?.amplitude).toBeGreaterThan(oldAmplitude);
  });
});
