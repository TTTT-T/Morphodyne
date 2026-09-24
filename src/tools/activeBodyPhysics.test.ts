import { describe, expect, it } from 'vitest';
import { createControlSignal } from '../core/actuation';
import type { Blueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { createActiveBlueprint, getActiveBodyAssemblies } from './activeBody';
import { ActiveBodyController, type ControlIntent, type JointFeedback } from '../simulation/ActiveBodyController';
import { EnergyRuntime } from '../simulation/EnergyRuntime';
import { JointActuatorRuntime } from '../simulation/JointActuatorRuntime';

interface TrialResult { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }

async function trial(intent: ControlIntent, options: { powered?: boolean; impact?: boolean; friction?: number; mass?: number; outputScale?: number } = {}): Promise<TrialResult> {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
  const original = createActiveBlueprint();
  const blueprint: Blueprint = {
    ...original,
    materials: original.materials.map((material) => ({ ...material, friction: options.friction ?? material.friction })),
    parts: original.parts.map((part) => ({ ...part, mass: part.mass === undefined ? undefined : part.mass * (options.mass ?? 1) })),
    actuators: original.actuators?.map((actuator) => ({ ...actuator, maxOutput: actuator.maxOutput * (options.outputScale ?? 1) })),
  };
  const body = physics.createBody({ id: 'trial', blueprint });
  const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
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
  const runtime = new JointActuatorRuntime(blueprint, physics, body, new EnergyRuntime({ capacityJ: 100000, maxPowerWatts: options.powered === false ? 0 : 400, efficiency: 1 }));
  let projectile: number | undefined;
  for (let tick = 0; tick < 300; tick += 1) {
    if (options.impact && tick === 180) {
      projectile = physics.createBox({ halfExtents: { x: 0.3, y: 0.3, z: 0.3 }, position: { x: 0, y: 1.8, z: -3 }, dynamic: true });
      physics.applyImpulse(projectile, { x: 0, y: 0, z: 1.5 });
    }
    const joints = new Map<string, JointFeedback>();
    for (const actuator of blueprint.actuators ?? []) {
      if (actuator.kind === 'tension') continue;
      joints.set(actuator.id, {
      angle: physics.readJointPosition(body, actuator.connectionId),
      angularVelocity: physics.readJointVelocity(body, actuator.connectionId),
      });
    }
    const signals = controller.update(1 / 60, body.readPartPose('part-core'), tick < 120 ? { forward: 0, turn: 0 } : intent, { joints });
    const drive = tick < 120 ? { forward: 0, turn: 0 } : intent;
    const driveSignals = getActiveBodyAssemblies().map((assembly) => {
      const x = parts.get(assembly.partIds[0])!.pose.position.x;
      return createControlSignal(`actuator-${assembly.connectionIds[2]}`, Math.max(-1, Math.min(1, 0.03 * drive.forward + drive.turn * Math.sign(x))));
    });
    runtime.step([...signals, ...driveSignals, createControlSignal('actuator-connection-4', drive.turn)], 1 / 60);
    physics.step(1 / 60);
  }
  if (projectile !== undefined) expect(physics.readPose(projectile).position.z).toBeGreaterThan(-3);
  const pose = body.readPartPose('part-core');
  const { x, y, z, w } = pose.rotation;
  return { ...pose.position, yaw: Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z)) };
}

describe('active body physical acceptance', () => {
  it('compares standing, forward, turn, and impact trajectories', async () => {
    const standing = await trial({ forward: 0, turn: 0 });
    const forward = await trial({ forward: 1, turn: 0 });
    const turning = await trial({ forward: 0, turn: 1 });
    const impact = await trial({ forward: 0, turn: 0 }, { impact: true });
    const unpowered = await trial({ forward: 1, turn: 0 }, { powered: false });
    expect(standing.y).toBeGreaterThan(1.7);
    expect(forward.y).toBeGreaterThan(1.1);
    expect(forward.z).toBeLessThan(standing.z - 0.5);
    expect(turning.y).toBeGreaterThan(0.9);
    expect(Math.abs(turning.yaw - standing.yaw)).toBeGreaterThan(0.2);
    expect(Math.abs(impact.z - standing.z)).toBeGreaterThan(0.05);
    expect(Math.abs(forward.z - unpowered.z)).toBeGreaterThan(0.05);
  });

  it('changes trajectory when physical parameters change', async () => {
    const baseline = await trial({ forward: 1, turn: 0 });
    const heavier = await trial({ forward: 1, turn: 0 }, { mass: 2 });
    const weaker = await trial({ forward: 1, turn: 0 }, { outputScale: 0.5 });
    const slippery = await trial({ forward: 1, turn: 0 }, { friction: 0.1 });
    expect(Math.abs(heavier.z - baseline.z)).toBeGreaterThan(0.05);
    expect(Math.abs(weaker.z - baseline.z)).toBeGreaterThan(0.05);
    expect(Math.abs(slippery.z - baseline.z)).toBeGreaterThan(0.05);
  });
});
