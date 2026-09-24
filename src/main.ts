import './style.css';
import { createControlSignal } from './core/actuation';
import type { Entity, Pose } from './core/model';
import { RapierPhysicsAdapter } from './physics/RapierPhysicsAdapter';
import type { PhysicsBody } from './physics/PhysicsBody';
import { ThreeSmokeRenderer } from './rendering/ThreeSmokeRenderer';
import { ActiveBodyController, type ControlIntent, type JointFeedback } from './simulation/ActiveBodyController';
import { BrainRuntime, type BrainSnapshot } from './simulation/BrainRuntime';
import { SkillRuntime, type SkillRuntimeSnapshot } from './simulation/SkillRuntime';
import { WorldRuntime, type WorldControlSource } from './simulation/WorldRuntime';
import {
  createActuatedMachineBlueprint,
  createPassiveObjectBlueprint,
  createSensorPlatformBlueprint,
} from './tools/worldFixtures';
import { createActiveBlueprint, getActiveBodyAssemblies } from './tools/activeBody';
import { consoleLogSink } from './tools/logging';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;

function formatIds(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(', ') : '—';
}

function entityWorldLine(
  entity: ReturnType<WorldRuntime['listEntities']>[number],
  world: WorldRuntime,
): string {
  const components = entity.componentIds
    .map((id) => world.inspectComponent(id))
    .filter((component): component is NonNullable<ReturnType<WorldRuntime['inspectComponent']>> => component !== undefined);
  const connectionIds = [...new Set(components.flatMap((component) => component.connectionIds))];
  return `${entity.id} | P${entity.partIds.length} C${connectionIds.length} A${entity.actuatorIds.length} S${entity.sensorIds.length} | Agent=${entity.agentPresent ? 'yes' : 'no'}`;
}

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root element');

  const panel = document.createElement('div');
  panel.className = 'status';
  panel.setAttribute('role', 'status');
  app.append(panel);
  const status = document.createElement('div');
  panel.append(status);
  const worldStatus = document.createElement('div');
  worldStatus.className = 'world-status';
  panel.append(worldStatus);
  const structureStatus = document.createElement('div');
  structureStatus.className = 'structure-status';
  panel.append(structureStatus);
  const sensorStatus = document.createElement('div');
  sensorStatus.className = 'sensor-status';
  panel.append(sensorStatus);
  const brainStatus = document.createElement('div');
  brainStatus.className = 'brain-status';
  panel.append(brainStatus);
  const skillStatus = document.createElement('div');
  skillStatus.className = 'skill-status';
  panel.append(skillStatus);
  const controls = document.createElement('div');
  controls.className = 'controls';
  panel.append(controls);

  const physics = await RapierPhysicsAdapter.create();
  const renderer = new ThreeSmokeRenderer(app);
  const groundSpec = {
    halfExtents: { x: 12, y: 0.1, z: 12 },
    position: { x: 0, y: -0.1, z: 0 },
    dynamic: false,
  } as const;
  const ground = physics.createBox(groundSpec);
  renderer.addBox(ground, groundSpec.halfExtents, 0x343b46);
  renderer.setPose(ground, physics.readPose(ground));

  const world = new WorldRuntime(physics);
  const passiveEntity: Entity = { id: 'entity-passive-object', blueprint: createPassiveObjectBlueprint() };
  const sensorTargetEntity: Entity = { id: 'entity-sensor-target', blueprint: createPassiveObjectBlueprint() };
  const machineEntity: Entity = { id: 'entity-actuated-machine', blueprint: createActuatedMachineBlueprint() };
  const sensorPlatformEntity: Entity = { id: 'entity-sensor-platform', blueprint: createSensorPlatformBlueprint() };
  const agentEntity: Entity = { id: 'entity-active-agent', blueprint: createActiveBlueprint() };
  const agentId = agentEntity.id;
  const sensorPlatformId = sensorPlatformEntity.id;

  const agentParts = new Map(agentEntity.blueprint.parts.map((part) => [part.id, part]));
  const activeAssemblies = getActiveBodyAssemblies();
  const controller = ActiveBodyController.fromGroups(activeAssemblies.map((assembly, index) => {
    const position = agentParts.get(assembly.partIds[0])!.pose.position;
    const phase = index === 0 || index === 3 ? 0 : Math.PI;
    return {
      actuatorIds: assembly.connectionIds.slice(0, 2).map((id) => `actuator-${id}`),
      x: position.x,
      z: position.z,
      phaseOffsets: [phase, phase + Math.PI / 2],
    };
  }), { standingGain: 0.01, standingDampingGain: 0, jointPositionGain: 3, jointVelocityGain: 0.6, turnGain: 0 });

  const brain = new BrainRuntime();
  const skill = new SkillRuntime();
  let brainSnapshot: BrainSnapshot | null = null;
  let skillSnapshot: SkillRuntimeSnapshot | null = null;
  let autonomous = true;
  let intent: ControlIntent = { forward: 0, turn: 0 };
  let mode = 'Auto · Stand';

  // This callback is the optional Agent composition. WorldRuntime owns the
  // actuator runtime and invokes the callback before its fixed physics step.
  const agentControl: WorldControlSource = (seconds) => {
    const sensorRuntime = world.readSensorRuntime(agentId);
    const view = sensorRuntime?.readAgentView();
    if (view && view.tick >= 0) {
      brainSnapshot = brain.update(view);
      if (autonomous) {
        skillSnapshot = skill.update(brainSnapshot);
        intent = skillSnapshot.control;
        mode = `Auto · ${brainSnapshot.skillIntent.skill}`;
      }
    }

    const perception = view?.perceptions ?? [];
    const joints = new Map<string, JointFeedback>();
    for (const measured of perception) {
      if (measured.channel !== 'joint' || !measured.ownConnectionId) continue;
      joints.set(`actuator-${measured.ownConnectionId}`, {
        angle: measured.values[0], angularVelocity: measured.values[1],
      });
    }
    const orientation = perception.find((entry) => entry.sensorId === 'sensor-core-internal' && entry.channel === 'orientation');
    const angular = perception.find((entry) => entry.sensorId === 'sensor-core-internal' && entry.channel === 'angular-velocity');
    const sensedPose: Pose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: orientation
        ? { x: orientation.values[0], y: orientation.values[1], z: orientation.values[2], w: orientation.values[3] }
        : IDENTITY_ROTATION,
    };
    const signals = controller.update(seconds, sensedPose, intent, {
      joints,
      ...(angular ? { bodyAngularVelocity: { x: angular.values[0], y: angular.values[1], z: angular.values[2] } } : {}),
    });
    const driveSignals = activeAssemblies.map((assembly) => {
      const x = agentParts.get(assembly.partIds[0])!.pose.position.x;
      return createControlSignal(
        `actuator-${assembly.connectionIds[2]}`,
        Math.max(-1, Math.min(1, 0.03 * intent.forward * (intent.amplitude ?? 1) + intent.turn * Math.sign(x))),
      );
    });
    return [...signals, ...driveSignals, createControlSignal('actuator-connection-4', intent.turn)];
  };

  const machineControl: WorldControlSource = (_seconds, tick) => [
    createControlSignal('machine-hinge-actuator', Math.sin(tick * 0.12)),
  ];

  world.spawn(passiveEntity, { origin: { x: -3.2, y: 0, z: 1.3 } });
  world.spawn(machineEntity, {
    origin: { x: 3.2, y: 0, z: 1.3 },
    energy: { availablePowerWatts: 100 },
    control: machineControl,
  });
  world.spawn(sensorPlatformEntity, { origin: { x: -0.8, y: 0, z: -2.8 } });
  world.spawn(sensorTargetEntity, { origin: { x: 1.25, y: 0, z: -2.8 } });
  world.spawn(agentEntity, {
    origin: { x: 0, y: 0, z: 2.4 },
    energy: { availablePowerWatts: 400 },
    agent: { control: agentControl },
  });

  const renderEntries: { entity: Entity; body: PhysicsBody; color: number }[] = [
    { entity: passiveEntity, body: world.getPhysicsBody(passiveEntity.id), color: 0x82cfa6 },
    { entity: machineEntity, body: world.getPhysicsBody(machineEntity.id), color: 0xd19a66 },
    { entity: sensorPlatformEntity, body: world.getPhysicsBody(sensorPlatformEntity.id), color: 0x63c4d7 },
    { entity: sensorTargetEntity, body: world.getPhysicsBody(sensorTargetEntity.id), color: 0x7d86cd },
    { entity: agentEntity, body: world.getPhysicsBody(agentEntity.id), color: 0x9eb7c9 },
  ];
  for (const { entity, body, color } of renderEntries) {
    for (const part of entity.blueprint.parts) {
      const handle = body.partHandles.get(part.id);
      if (handle === undefined) throw new Error(`Missing runtime handle for part: ${part.id}`);
      renderer.addPart(handle, part.geometry, part.id === 'part-core' ? 0xe5b86a : color);
    }
  }

  function addButton(label: string, next: ControlIntent): void {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => {
      autonomous = false;
      skill.cancelAttempt();
      intent = next;
      mode = label;
    });
    controls.append(button);
  }
  addButton('Stand', { forward: 0, turn: 0 });
  addButton('Forward', { forward: 1, turn: 0 });
  addButton('Turn left', { forward: 0, turn: -1 });
  addButton('Turn right', { forward: 0, turn: 1 });

  const autoButton = document.createElement('button');
  autoButton.textContent = 'Auto brain';
  autoButton.addEventListener('click', () => {
    autonomous = true;
    mode = 'Auto · waiting';
  });
  controls.append(autoButton);

  const damageButton = document.createElement('button');
  damageButton.textContent = 'Impact / Damage';
  damageButton.addEventListener('click', () => {
    const body = world.getPhysicsBody(agentId);
    const targetPartId = activeAssemblies[0].partIds[0];
    const handle = body.partHandles.get(targetPartId);
    const coreHandle = body.partHandles.get('part-core');
    if (handle === undefined || coreHandle === undefined) throw new Error(`Missing runtime handle for impact: ${targetPartId}`);
    // A localized opposing impulse pair loads the attachment without
    // prescribing whether the structure withstands or separates.
    physics.applyImpulse(handle, { x: 0, y: 0, z: -3 });
    physics.applyImpulse(coreHandle, { x: 0, y: 0, z: 3 });
  });
  controls.append(damageButton);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset experiment';
  resetButton.addEventListener('click', () => location.reload());
  controls.append(resetButton);

  let nextImpactEntityId = 1;
  const impactButton = document.createElement('button');
  impactButton.textContent = 'External impact';
  impactButton.addEventListener('click', () => {
    const corePose = world.readPartPose(agentId, 'part-core');
    const entity: Entity = {
      id: `entity-impact-${nextImpactEntityId++}`,
      blueprint: createPassiveObjectBlueprint({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 }, mass: 0.3 }),
    };
    world.spawn(entity, { origin: { x: corePose.position.x, y: corePose.position.y - 0.3, z: corePose.position.z - 3 } });
    const body = world.getPhysicsBody(entity.id);
    const handle = body.partHandles.get('passive-object-body');
    if (handle === undefined) throw new Error(`Missing impact Part: ${entity.id}`);
    physics.applyImpulse(handle, { x: 0, y: 0, z: 1.5 });
    renderer.addPart(handle, entity.blueprint.parts[0].geometry, 0xea6f65);
    renderEntries.push({ entity, body, color: 0xea6f65 });
  });
  controls.append(impactButton);

  function updateWorldPanel(): void {
    const entities = world.listEntities();
    const components = world.listComponents();
    const detached = components.filter((component) => component.detached);
    const componentLines = detached.length === 0
      ? 'Detached components: none'
      : `Detached components:\n${detached.map((component) => {
        const cause = component.separatedBy
          ? ` via ${component.separatedBy.connectionId} @ tick ${component.separatedBy.tick}`
          : '';
        return `  ${component.id} <= ${component.sourceEntityId} parts [${formatIds(component.partIds)}]${cause}`;
      }).join('\n')}`;
    worldStatus.textContent = [`World entities: ${entities.length}`, ...entities.map((entity) => entityWorldLine(entity, world)), componentLines].join('\n');
    structureStatus.textContent = detached.length === 0
      ? 'Structure: all components attached'
      : `Structure: ${detached.length} detached component${detached.length === 1 ? '' : 's'}; ownership retained by source Entity`;
  }

  function readSensorObservations(componentIds: readonly string[]) {
    return componentIds.flatMap((componentId) => world.readObservations(componentId));
  }

  consoleLogSink.write({ level: 'info', source: 'active-body', message: 'Phase 6.5 world scene ready' });

  let previousTime: number | undefined;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    world.advance(elapsed);

    for (const { entity, body } of renderEntries) {
      for (const part of entity.blueprint.parts) {
        const handle = body.partHandles.get(part.id);
        if (handle === undefined) continue;
        renderer.setPose(handle, body.readPartPose(part.id));
      }
    }
    const agentBody = world.getPhysicsBody(agentId);
    const rootPose = agentBody.readPartPose('part-core');
    const root = rootPose.position;
    const { x, y, z, w } = rootPose.rotation;
    const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
    const agentComponents = world.listComponents().filter((component) => component.sourceEntityId === agentId);
    const agentObservations = readSensorObservations(agentComponents.map((component) => component.id));
    const platformView = world.inspectEntity(sensorPlatformId);
    const platformObservations = world.readObservations(sensorPlatformId);
    const platformSensorRuntime = world.readSensorRuntime(sensorPlatformId);
    const platformRanges = platformObservations.filter((entry) => entry.channel === 'range');
    const nearestPlatformRange = platformRanges.length ? Math.min(...platformRanges.map((entry) => entry.values[3])) : undefined;
    const activeSensors = agentComponents.flatMap((component) => world.readSensorRuntime(component.id)?.readActiveSensorIds() ?? []);
    const rangeHits = agentObservations.filter((entry) => entry.channel === 'range');
    const contacts = agentObservations.filter((entry) => entry.channel === 'contact');
    const nearestRange = rangeHits.length ? Math.min(...rangeHits.map((entry) => entry.values[3])) : undefined;
    const strongestContact = contacts.length ? Math.max(...contacts.map((entry) => entry.values[3])) : undefined;
    const rangeSensor = agentEntity.blueprint.sensors?.find((sensor) => sensor.id === 'sensor-forward-range');
    const rangeSensorComponent = rangeSensor
      ? agentComponents.find((component) => component.sensorIds.includes(rangeSensor.id)
        && component.partIds.includes(rangeSensor.partId))
      : undefined;
    if (rangeSensor?.kind === 'range' && rangeSensorComponent) {
      const sensorPartPose = world.readPartPose(rangeSensorComponent.id, rangeSensor.partId);
      renderer.setMountedSensorRay(
        `agent-${rangeSensor.id}`,
        sensorPartPose,
        rangeSensor.localPose,
        rangeSensor.forward,
        rangeSensor.range,
        world.readSensorRuntime(rangeSensorComponent.id)?.readActiveSensorIds().includes(rangeSensor.id) ?? false,
      );
    }
    const platformSensor = sensorPlatformEntity.blueprint.sensors?.[0];
    if (platformSensor?.kind === 'range' && platformView) {
      renderer.setMountedSensorRay(
        `platform-${platformSensor.id}`,
        world.readPartPose(sensorPlatformId, platformSensor.partId),
        platformSensor.localPose,
        platformSensor.forward,
        platformSensor.range,
        platformSensorRuntime?.readActiveSensorIds().includes(platformSensor.id) ?? false,
      );
    }

    updateWorldPanel();
    sensorStatus.textContent = `Sensor platform ${sensorPlatformId}: active ${platformSensorRuntime?.readActiveSensorIds().length ?? 0}/${sensorPlatformEntity.blueprint.sensors?.length ?? 0} · observations ${platformObservations.length} · range ${platformRanges.length}${nearestPlatformRange === undefined ? '' : `, nearest ${nearestPlatformRange.toFixed(2)} m`} · Agent observations ${agentObservations.length} · contacts ${contacts.length}${strongestContact === undefined ? '' : `, peak ${strongestContact.toFixed(2)} N·s`}`;
    if (brainSnapshot) {
      const { selfModel, worldModel, drives, decision, skillIntent } = brainSnapshot;
      brainStatus.textContent = `Brain ${autonomous ? 'auto' : 'manual'} · goal ${decision?.goal.kind ?? 'none'} · skill ${skillIntent.skill} · avoid ${drives.avoid.toFixed(2)} · explore ${drives.explore.toFixed(2)} · self ${selfModel.stability.level} · feedback gap ${selfModel.feedbackGapRecent ? 'recent' : 'none'} · surfaces ${worldModel.ranges.length} · joints ${selfModel.joints.length}`;
      brainStatus.dataset.goal = decision?.goal.kind ?? '';
      brainStatus.dataset.skill = skillIntent.skill;
      brainStatus.dataset.avoid = String(drives.avoid);
      brainStatus.dataset.surfaces = String(worldModel.ranges.length);
      brainStatus.dataset.joints = String(selfModel.joints.length);
    }
    if (skillSnapshot) {
      const experience = skillSnapshot.lastExperience;
      const prediction = skillSnapshot.prediction;
      const parameters = skillSnapshot.parameters;
      skillStatus.textContent = `Forward motor amplitude ${parameters.amplitude.toFixed(2)} · phase ${parameters.phaseOffset.toFixed(2)} rad · predicted ${prediction?.forwardProgress.toFixed(3) ?? '—'} m · observed ${experience?.observation.forwardProgress.toFixed(3) ?? '—'} m · error ${experience?.error.forwardProgress.toFixed(3) ?? '—'} m · adaptations ${skillSnapshot.adaptationCount} · last adjustment ${skillSnapshot.lastAdjustment?.reason ?? 'none'}`;
      skillStatus.dataset.amplitude = String(parameters.amplitude);
      skillStatus.dataset.phaseOffset = String(parameters.phaseOffset);
      skillStatus.dataset.prediction = prediction ? String(prediction.forwardProgress) : '';
      skillStatus.dataset.observed = experience ? String(experience.observation.forwardProgress) : '';
      skillStatus.dataset.error = experience ? String(experience.error.forwardProgress) : '';
      skillStatus.dataset.adaptations = String(skillSnapshot.adaptationCount);
      skillStatus.dataset.experiences = String(skillSnapshot.experienceCount);
    }
    renderer.render();
    const separatedConnections = Object.values(world.getDamageRuntime(agentId).state.connections)
      .filter((connection) => !connection.connected).length;
    status.textContent = `Morphodyne Phase 6.5 · ${mode} · tick ${world.tick} · x ${root.x.toFixed(2)} · y ${root.y.toFixed(2)} · z ${root.z.toFixed(2)} · yaw ${yaw.toFixed(2)}`;
    status.dataset.tick = String(world.tick);
    status.dataset.coreX = String(root.x);
    status.dataset.coreY = String(root.y);
    status.dataset.coreZ = String(root.z);
    status.dataset.yaw = String(yaw);
    status.dataset.separatedConnections = String(separatedConnections);
    status.dataset.activeSensors = String(activeSensors.length);
    status.dataset.rangeReturns = String(rangeHits.length);
    status.dataset.nearestRange = nearestRange === undefined ? '' : String(nearestRange);
    status.dataset.contacts = String(contacts.length);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main().catch((error: unknown) => {
  consoleLogSink.write({ level: 'error', source: 'bootstrap', message: String(error) });
  const app = document.querySelector('#app');
  if (app) app.textContent = `World scene failed: ${String(error)}`;
});
