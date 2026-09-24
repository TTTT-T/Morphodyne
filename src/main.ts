import './style.css';
import { createControlSignal } from './core/actuation';
import type { Entity, Pose } from './core/model';
import { RapierPhysicsAdapter } from './physics/RapierPhysicsAdapter';
import type { PhysicsBody } from './physics/PhysicsBody';
import { ThreeSmokeRenderer } from './rendering/ThreeSmokeRenderer';
import { ActiveBodyController, type ControlIntent, type JointFeedback } from './simulation/ActiveBodyController';
import { BrainRuntime, type BrainSnapshot } from './simulation/BrainRuntime';
import { ConstructionRuntime } from './simulation/ConstructionRuntime';
import { SkillRuntime, type SkillRuntimeSnapshot } from './simulation/SkillRuntime';
import { WorldRuntime, type WorldControlSource } from './simulation/WorldRuntime';
import {
  createActuatedMachineBlueprint,
  createPassiveObjectBlueprint,
  createSensorPlatformBlueprint,
} from './tools/worldFixtures';
import { createActiveBlueprint, getActiveBodyAssemblies } from './tools/activeBody';
import { environmentScene } from './tools/environmentScene';
import { mountGodSandboxPanel } from './tools/GodSandboxPanel';
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
  return `${entity.id} | 部件 ${entity.partIds.length} · 连接 ${connectionIds.length} · 执行器 ${entity.actuatorIds.length} · 传感器 ${entity.sensorIds.length} | Agent：${entity.agentPresent ? '有' : '无'}`;
}

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('缺少页面根元素 #app');

  const panel = document.createElement('details');
  panel.className = 'status';
  const debugSummary = document.createElement('summary');
  debugSummary.textContent = '运行信息与 Agent 控制（高级 / 调试）';
  panel.append(debugSummary);
  app.append(panel);
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
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
  const environmentStatus = document.createElement('details');
  environmentStatus.className = 'environment-status';
  const environmentSummary = document.createElement('summary');
  const environmentDetails = document.createElement('div');
  environmentStatus.append(environmentSummary, environmentDetails);
  panel.append(environmentStatus);
  const controls = document.createElement('div');
  controls.className = 'controls';
  panel.append(controls);

  const physics = await RapierPhysicsAdapter.create();
  const renderer = new ThreeSmokeRenderer(app);
  const world = new WorldRuntime(physics, environmentScene);
  const construction = new ConstructionRuntime(world);
  for (const surface of world.environment.listSurfaces()) {
    const color = surface.id === 'surface-slippery' ? 0x54819a
      : surface.id === 'surface-slope' ? 0x777c65 : 0x4a5057;
    renderer.addEnvironmentSurface(surface.id, surface.halfExtents, {
      position: surface.position,
      rotation: surface.rotation ?? IDENTITY_ROTATION,
    }, color);
  }
  for (const volume of world.environment.listVolumes()) {
    renderer.addWaterVolume(volume.id, volume.min, volume.max);
  }
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
  let mode = '自动 · 站立';

  // This callback is the optional Agent composition. WorldRuntime owns the
  // actuator runtime and invokes the callback before its fixed physics step.
  const agentControl: WorldControlSource = (seconds) => {
    const agentCoreComponent = world.listComponents().find((component) => component.sourceEntityId === agentId
      && component.partIds.includes('part-core'));
    const sensorRuntime = agentCoreComponent ? world.readSensorRuntime(agentCoreComponent.id) : undefined;
    const view = sensorRuntime?.readAgentView();
    if (view && view.tick >= 0) {
      brainSnapshot = brain.update(view);
      if (autonomous) {
        skillSnapshot = skill.update(brainSnapshot);
        intent = skillSnapshot.control;
        mode = `自动 · ${brainSnapshot.skillIntent.skill}`;
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

  construction.spawn(passiveEntity, { origin: { x: -3.2, y: 0, z: 1.3 } });
  construction.spawn(machineEntity, {
    origin: { x: 3.2, y: 0, z: 1.3 },
    energy: { availablePowerWatts: 100 },
    control: machineControl,
  });
  construction.spawn(sensorPlatformEntity, { origin: { x: -0.8, y: 0, z: -2.8 } });
  construction.spawn(sensorTargetEntity, { origin: { x: 1.25, y: 0, z: -2.8 } });
  construction.spawn(agentEntity, {
    origin: { x: 0, y: 0, z: 2.4 },
    energy: { availablePowerWatts: 400 },
    agent: { control: agentControl },
  });

  const colors = new Map<string, number>([
    [passiveEntity.id, 0x82cfa6], [machineEntity.id, 0xd19a66],
    [sensorPlatformEntity.id, 0x63c4d7], [sensorTargetEntity.id, 0x7d86cd],
    [agentEntity.id, 0x9eb7c9],
  ]);
  let renderEntries: { entity: Entity; body: PhysicsBody; color: number }[] = [];
  const renderedHandles = new Set<number>();
  function syncRenderEntries(): void {
    const current = new Set<number>();
    renderEntries = world.listEntities().map(({ id }) => ({
      entity: { id, blueprint: world.readBlueprint(id) },
      body: world.getPhysicsBody(id), color: colors.get(id) ?? 0xa8be9a,
    }));
    for (const { entity, body, color } of renderEntries) {
      for (const part of entity.blueprint.parts) {
        const handle = body.partHandles.get(part.id)!;
        current.add(handle);
        if (!renderedHandles.has(handle)) renderer.addPart(handle, part.geometry, part.id === 'part-core' ? 0xe5b86a : color);
        renderer.setPose(handle, body.readPartPose(part.id));
      }
    }
    for (const handle of renderedHandles) if (!current.has(handle)) renderer.removePart(handle);
    renderedHandles.clear();
    for (const handle of current) renderedHandles.add(handle);
  }
  syncRenderEntries();
  const sandboxPanel = mountGodSandboxPanel(app, world, construction, syncRenderEntries);

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
  addButton('站立', { forward: 0, turn: 0 });
  addButton('前进', { forward: 1, turn: 0 });
  addButton('左转', { forward: 0, turn: -1 });
  addButton('右转', { forward: 0, turn: 1 });

  const autoButton = document.createElement('button');
  autoButton.textContent = '恢复自动控制';
  autoButton.addEventListener('click', () => {
    autonomous = true;
    mode = '自动 · 等待感知';
  });
  controls.append(autoButton);

  const damageButton = document.createElement('button');
  damageButton.textContent = '冲击 Agent 测试部件';
  damageButton.addEventListener('click', () => {
    const targetPartId = activeAssemblies[0].partIds[0];
    // A localized opposing impulse pair loads the attachment without
    // prescribing whether the structure withstands or separates.
    const target = world.listComponents().find((component) => component.sourceEntityId === agentId
      && component.partIds.includes(targetPartId));
    const core = world.listComponents().find((component) => component.sourceEntityId === agentId
      && component.partIds.includes('part-core'));
    if (target && core) {
      construction.applyImpact(target.id, targetPartId, { x: 0, y: 0, z: -3 });
      construction.applyImpact(core.id, 'part-core', { x: 0, y: 0, z: 3 });
    }
  });
  controls.append(damageButton);

  const resetButton = document.createElement('button');
  resetButton.textContent = '重置场景';
  resetButton.addEventListener('click', () => location.reload());
  controls.append(resetButton);

  let nextImpactEntityId = 1;
  const impactButton = document.createElement('button');
  impactButton.textContent = '生成外部冲击物体';
  impactButton.addEventListener('click', () => {
    const coreComponent = world.listComponents().find((component) => component.sourceEntityId === agentId
      && component.partIds.includes('part-core'));
    if (!coreComponent) return;
    const corePose = world.readPartPose(coreComponent.id, 'part-core');
    const entity: Entity = {
      id: `entity-impact-${nextImpactEntityId++}`,
      blueprint: createPassiveObjectBlueprint({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 }, mass: 0.3 }),
    };
    construction.spawn(entity, { origin: { x: corePose.position.x, y: corePose.position.y - 0.3, z: corePose.position.z - 3 } });
    construction.applyImpact(entity.id, 'passive-object-body', { x: 0, y: 0, z: 1.5 });
    colors.set(entity.id, 0xea6f65);
    syncRenderEntries();
  });
  controls.append(impactButton);

  function updateWorldPanel(): void {
    const entities = world.listEntities();
    const components = world.listComponents();
    const detached = components.filter((component) => component.detached);
    const componentLines = detached.length === 0
      ? '已分离组件：无'
      : `已分离组件：\n${detached.map((component) => {
        const cause = component.separatedBy
          ? ` 经 ${component.separatedBy.connectionId} 于第 ${component.separatedBy.tick} 步分离`
          : '';
        return `  ${component.id} <= ${component.sourceEntityId} 部件 [${formatIds(component.partIds)}]${cause}`;
      }).join('\n')}`;
    worldStatus.textContent = [`世界物体：${entities.length}`, ...entities.map((entity) => entityWorldLine(entity, world)), componentLines].join('\n');
    structureStatus.textContent = detached.length === 0
      ? '结构：所有组件均已连接'
      : `结构：${detached.length} 个组件已分离；仍归原物体所有`;

    const environment = world.environment;
    const state = environment.state;
    renderer.setDaylightFactor(state.daylightFactor);
    const surfaces = environment.listSurfaces().map((surface) =>
      `${surface.id} μ=${surface.effectiveFriction.toFixed(2)}`).join(' · ');
    const volumes = environment.listVolumes().map((volume) =>
      `${volume.id} ρ=${volume.density.toFixed(1)} drag=${volume.drag.toFixed(1)}`).join(' · ');
    const regionLines = world.listComponents().flatMap((component) => {
      if (!renderEntries.some((entry) => entry.entity.id === component.sourceEntityId)) return [];
      return component.partIds.map((partId) => {
        const regions = world.inspectPartEnvironment(component.id, partId);
        return `${component.sourceEntityId}/${partId}: S[${formatIds(regions.surfaceIds)}] V[${formatIds(regions.volumeIds)}]`;
      });
    });
    environmentSummary.textContent = `环境：${state.weather === 'rain' ? '雨' : '晴'} · ${state.timeOfDay.toFixed(1)} 时 · 日照 ${state.daylightFactor.toFixed(2)}（区域）`;
    environmentDetails.textContent = [
      `地面 ${surfaces || '无'} · 水域 ${volumes || '无'}`,
      ...regionLines,
    ].join('\n');
  }

  function readSensorObservations(componentIds: readonly string[]) {
    return componentIds.flatMap((componentId) => world.readObservations(componentId));
  }

  consoleLogSink.write({ level: 'info', source: 'world-scene', message: 'Phase 8 God Sandbox ready' });

  let previousTime: number | undefined;
  let lastPanelTick = -1;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    world.advance(elapsed);
    if (world.tick !== lastPanelTick && world.tick % 30 === 0) {
      sandboxPanel.refresh();
      lastPanelTick = world.tick;
    }

    syncRenderEntries();
    const agentLive = world.inspectEntity(agentId)?.partIds.includes('part-core') ?? false;
    const rootPose = agentLive ? world.getPhysicsBody(agentId).readPartPose('part-core') : undefined;
    const root = rootPose?.position ?? { x: 0, y: 0, z: 0 };
    const { x, y, z, w } = rootPose?.rotation ?? IDENTITY_ROTATION;
    const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
    const agentComponents = world.listComponents().filter((component) => component.sourceEntityId === agentId);
    const agentObservations = readSensorObservations(agentComponents.map((component) => component.id));
    const platformView = world.inspectEntity(sensorPlatformId);
    const platformComponent = world.listComponents().find((component) => component.sourceEntityId === sensorPlatformId
      && component.partIds.includes('sensor-platform-body'));
    const platformObservations = platformComponent ? world.readObservations(platformComponent.id) : [];
    const platformSensorRuntime = platformComponent ? world.readSensorRuntime(platformComponent.id) : undefined;
    const platformRanges = platformObservations.filter((entry) => entry.channel === 'range');
    const nearestPlatformRange = platformRanges.length ? Math.min(...platformRanges.map((entry) => entry.values[3])) : undefined;
    const activeSensors = agentComponents.flatMap((component) => world.readSensorRuntime(component.id)?.readActiveSensorIds() ?? []);
    const rangeHits = agentObservations.filter((entry) => entry.channel === 'range');
    const contacts = agentObservations.filter((entry) => entry.channel === 'contact');
    const nearestRange = rangeHits.length ? Math.min(...rangeHits.map((entry) => entry.values[3])) : undefined;
    const strongestContact = contacts.length ? Math.max(...contacts.map((entry) => entry.values[3])) : undefined;
    const rangeSensor = agentLive ? world.readBlueprint(agentId).sensors?.find((sensor) => sensor.id === 'sensor-forward-range') : undefined;
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
    const platformSensor = platformView ? world.readBlueprint(sensorPlatformId).sensors?.[0] : undefined;
    if (platformSensor?.kind === 'range' && platformComponent?.partIds.includes(platformSensor.partId)) {
      renderer.setMountedSensorRay(
        `platform-${platformSensor.id}`,
        world.readPartPose(platformComponent.id, platformSensor.partId),
        platformSensor.localPose,
        platformSensor.forward,
        platformSensor.range,
        platformSensorRuntime?.readActiveSensorIds().includes(platformSensor.id) ?? false,
      );
    }

    updateWorldPanel();
    sensorStatus.textContent = `传感器平台 ${sensorPlatformId}：启用 ${platformSensorRuntime?.readActiveSensorIds().length ?? 0}/${sensorPlatformEntity.blueprint.sensors?.length ?? 0} · 观测 ${platformObservations.length} · 距离回波 ${platformRanges.length}${nearestPlatformRange === undefined ? '' : `，最近 ${nearestPlatformRange.toFixed(2)} 米`} · Agent 观测 ${agentObservations.length} · 接触 ${contacts.length}${strongestContact === undefined ? '' : `，峰值 ${strongestContact.toFixed(2)} N·s`}`;
    if (brainSnapshot) {
      const { selfModel, worldModel, drives, decision, skillIntent } = brainSnapshot;
      brainStatus.textContent = `Agent 决策 ${autonomous ? '自动' : '手动'} · 目标 ${decision?.goal.kind ?? '无'} · 技能 ${skillIntent.skill} · 回避 ${drives.avoid.toFixed(2)} · 探索 ${drives.explore.toFixed(2)} · 自身稳定 ${selfModel.stability.level} · 反馈缺口 ${selfModel.feedbackGapRecent ? '近期有' : '无'} · 感知面 ${worldModel.ranges.length} · 关节 ${selfModel.joints.length}`;
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
      skillStatus.textContent = `前进输出 ${parameters.amplitude.toFixed(2)} · 相位 ${parameters.phaseOffset.toFixed(2)} rad · 预测 ${prediction?.forwardProgress.toFixed(3) ?? '—'} 米 · 实测 ${experience?.observation.forwardProgress.toFixed(3) ?? '—'} 米 · 误差 ${experience?.error.forwardProgress.toFixed(3) ?? '—'} 米 · 调整次数 ${skillSnapshot.adaptationCount} · 最近原因 ${skillSnapshot.lastAdjustment?.reason ?? '无'}`;
      skillStatus.dataset.amplitude = String(parameters.amplitude);
      skillStatus.dataset.phaseOffset = String(parameters.phaseOffset);
      skillStatus.dataset.prediction = prediction ? String(prediction.forwardProgress) : '';
      skillStatus.dataset.observed = experience ? String(experience.observation.forwardProgress) : '';
      skillStatus.dataset.error = experience ? String(experience.error.forwardProgress) : '';
      skillStatus.dataset.adaptations = String(skillSnapshot.adaptationCount);
      skillStatus.dataset.experiences = String(skillSnapshot.experienceCount);
    }
    renderer.render();
    const separatedConnections = Object.values(agentLive ? world.getDamageRuntime(agentId).state.connections : {})
      .filter((connection) => !connection.connected).length;
    status.textContent = `Morphodyne · ${mode} · 第 ${world.tick} 步 · x ${root.x.toFixed(2)} · y ${root.y.toFixed(2)} · z ${root.z.toFixed(2)} · 朝向 ${yaw.toFixed(2)}`;
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
  if (app) app.textContent = `世界场景启动失败：${String(error)}`;
});
