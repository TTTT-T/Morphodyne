import './style.css';
import { createControlSignal } from './core/actuation';
import type { Entity } from './core/model';
import { RapierPhysicsAdapter } from './physics/RapierPhysicsAdapter';
import { ThreeSmokeRenderer } from './rendering/ThreeSmokeRenderer';
import { ActiveBodyController, type ControlIntent, type JointFeedback } from './simulation/ActiveBodyController';
import { FixedStepSimulation } from './simulation/FixedStepSimulation';
import { JointActuatorRuntime } from './simulation/JointActuatorRuntime';
import { StructuralDamageRuntime } from './simulation/StructuralDamageRuntime';
import { createActiveBlueprint, getActiveBodyAssemblies } from './tools/activeBody';
import { consoleLogSink } from './tools/logging';

async function main(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app root element');
  const panel = document.createElement('div');
  panel.className = 'status';
  panel.setAttribute('role', 'status');
  app.append(panel);
  const status = document.createElement('div');
  panel.append(status);
  const structureStatus = document.createElement('div');
  structureStatus.className = 'structure-status';
  structureStatus.textContent = 'Structure intact';
  panel.append(structureStatus);
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

  const entity: Entity = { id: 'entity-active-body', blueprint: createActiveBlueprint() };
  const body = physics.createBody(entity);
  for (const part of entity.blueprint.parts) {
    const handle = body.partHandles.get(part.id);
    if (handle === undefined) throw new Error(`Missing runtime handle for part: ${part.id}`);
    renderer.addPart(handle, part.geometry, part.id === 'part-core' ? 0xe5b86a : 0x9eb7c9);
  }

  const parts = new Map(entity.blueprint.parts.map((part) => [part.id, part]));
  const groups = getActiveBodyAssemblies().map((assembly, index) => {
    const position = parts.get(assembly.partIds[0])!.pose.position;
    const phase = index === 0 || index === 3 ? 0 : Math.PI;
    return {
      actuatorIds: assembly.connectionIds.slice(0, 2).map((id) => `actuator-${id}`),
      x: position.x,
      z: position.z,
      phaseOffsets: [phase, phase + Math.PI / 2],
    };
  });
  const controller = ActiveBodyController.fromGroups(groups, { standingGain: 0.01, standingDampingGain: 0, jointPositionGain: 3, jointVelocityGain: 0.6, turnGain: 0 });
  const actuatorRuntime = new JointActuatorRuntime(entity.blueprint, physics, body, { availablePowerWatts: 400 });
  const damageRuntime = new StructuralDamageRuntime(entity.blueprint, physics, body);
  let intent: ControlIntent = { forward: 0, turn: 0 };
  let mode = 'Stand';
  const projectiles: number[] = [];

  function addButton(label: string, next: ControlIntent): void {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => { intent = next; mode = label; });
    controls.append(button);
  }
  addButton('Stand', { forward: 0, turn: 0 });
  addButton('Forward', { forward: 1, turn: 0 });
  addButton('Turn left', { forward: 0, turn: -1 });
  addButton('Turn right', { forward: 0, turn: 1 });
  const damageButton = document.createElement('button');
  damageButton.textContent = 'Impact / Damage';
  damageButton.addEventListener('click', () => {
    const targetPartId = getActiveBodyAssemblies()[0].partIds[0];
    const handle = body.partHandles.get(targetPartId);
    if (handle === undefined) throw new Error(`Missing runtime handle for part: ${targetPartId}`);
    // A localized opposing impulse pair loads the attachment without
    // prescribing whether the structure withstands or separates.
    physics.applyImpulse(handle, { x: 0, y: 0, z: -3 });
    physics.applyImpulse(body.partHandles.get('part-core')!, { x: 0, y: 0, z: 3 });
  });
  controls.append(damageButton);
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset experiment';
  resetButton.addEventListener('click', () => location.reload());
  controls.append(resetButton);
  const impactButton = document.createElement('button');
  impactButton.textContent = 'External impact';
  impactButton.addEventListener('click', () => {
    const spec = {
      halfExtents: { x: 0.3, y: 0.3, z: 0.3 },
      position: { x: 0, y: 1.8, z: body.readPartPose('part-core').position.z - 3 },
      dynamic: true,
    } as const;
    const handle = physics.createBox(spec);
    physics.applyImpulse(handle, { x: 0, y: 0, z: 1.5 });
    renderer.addBox(handle, spec.halfExtents, 0xea6f65);
    projectiles.push(handle);
  });
  controls.append(impactButton);

  const simulation = new FixedStepSimulation(physics, (seconds) => {
    const joints = new Map<string, JointFeedback>();
    for (const actuator of entity.blueprint.actuators ?? []) {
      joints.set(actuator.id, {
        angle: physics.readJointPosition(body, actuator.connectionId),
        angularVelocity: physics.readJointVelocity(body, actuator.connectionId),
      });
    }
    const signals = controller.update(seconds, body.readPartPose('part-core'), intent, { joints });
    const driveSignals = getActiveBodyAssemblies().map((assembly) => {
      const x = parts.get(assembly.partIds[0])!.pose.position.x;
      return createControlSignal(`actuator-${assembly.connectionIds[2]}`, Math.max(-1, Math.min(1, 0.03 * intent.forward + intent.turn * Math.sign(x))));
    });
    actuatorRuntime.step([...signals, ...driveSignals, createControlSignal('actuator-connection-4', intent.turn)], seconds);
  }, (_seconds, tick) => {
    const events = damageRuntime.afterPhysicsStep(tick);
    const separated = Object.values(damageRuntime.state.connections)
      .filter((connection) => !connection.connected).map((connection) => connection.connectionId);
    const structural = events.filter((event) => event.target === 'connection');
    if (separated.length > 0) {
      structureStatus.textContent = `Separated: ${separated.join(', ')}`;
    } else if (structural.length > 0) {
      const latest = structural.find((event) => event.kind === 'separation') ?? structural[structural.length - 1];
      structureStatus.textContent = `${latest.connectionId}: ${latest.kind} · load ${latest.impulseNs.toFixed(2)} N·s`;
    }
  });
  consoleLogSink.write({ level: 'info', source: 'active-body', message: 'Phase 3 structural damage scene ready' });

  let previousTime: number | undefined;
  function frame(now: number): void {
    const elapsed = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    previousTime = now;
    simulation.advance(elapsed);
    for (const part of entity.blueprint.parts) {
      const handle = body.partHandles.get(part.id)!;
      renderer.setPose(handle, body.readPartPose(part.id));
    }
    for (const handle of projectiles) renderer.setPose(handle, physics.readPose(handle));
    const rootPose = body.readPartPose('part-core');
    const root = rootPose.position;
    const { x, y, z, w } = rootPose.rotation;
    const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
    renderer.render();
    status.textContent = `Morphodyne Phase 3 · ${mode} · tick ${simulation.tick} · x ${root.x.toFixed(2)} · y ${root.y.toFixed(2)} · z ${root.z.toFixed(2)} · yaw ${yaw.toFixed(2)}`;
    status.dataset.tick = String(simulation.tick);
    status.dataset.coreX = String(root.x);
    status.dataset.coreY = String(root.y);
    status.dataset.coreZ = String(root.z);
    status.dataset.yaw = String(yaw);
    status.dataset.separatedConnections = String(Object.values(damageRuntime.state.connections).filter((connection) => !connection.connected).length);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main().catch((error: unknown) => {
  consoleLogSink.write({ level: 'error', source: 'bootstrap', message: String(error) });
  const app = document.querySelector('#app');
  if (app) app.textContent = `Active scene failed: ${String(error)}`;
});
