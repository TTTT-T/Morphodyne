import { describe, expect, it } from 'vitest';
import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { Blueprint } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { ActiveBodyController, type JointFeedback } from '../simulation/ActiveBodyController';
import { EnergyRuntime } from '../simulation/EnergyRuntime';
import { JointActuatorRuntime } from '../simulation/JointActuatorRuntime';
import { StructuralDamageRuntime } from '../simulation/StructuralDamageRuntime';
import { createActiveBlueprint, getActiveBodyAssemblies } from './activeBody';

const STEP = 1 / 60;
const TOTAL_TICKS = 300;
const IMPACT_TICK = 120;

function groupsFor(blueprint: Blueprint) {
  const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
  return getActiveBodyAssemblies().map((assembly, index) => ({
    actuatorIds: assembly.connectionIds.slice(0, 2).map((id) => `actuator-${id}`),
    x: parts.get(assembly.partIds[0])!.pose.position.x,
    z: parts.get(assembly.partIds[0])!.pose.position.z,
    phaseOffsets: [index === 0 || index === 3 ? 0 : Math.PI, (index === 0 || index === 3 ? 0 : Math.PI) + Math.PI / 2],
  }));
}

async function setup(blueprint: Blueprint) {
  const physics = await RapierPhysicsAdapter.create();
  physics.createBox({ halfExtents: { x: 12, y: 0.1, z: 12 }, position: { x: 0, y: -0.1, z: 0 }, dynamic: false });
  const body = physics.createBody({ id: 'trial', blueprint });
  const actuator = new JointActuatorRuntime(blueprint, physics, body, new EnergyRuntime({ capacityJ: 100000, maxPowerWatts: 400, efficiency: 1 }));
  return { physics, body, actuator };
}

async function recordIdenticalSignals(): Promise<readonly (readonly ControlSignal[])[]> {
  const blueprint = createActiveBlueprint();
  const { physics, body, actuator } = await setup(blueprint);
  const controller = ActiveBodyController.fromGroups(groupsFor(blueprint), {
    standingGain: 0.01, standingDampingGain: 0, jointPositionGain: 3, jointVelocityGain: 0.6, turnGain: 0,
  });
  const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
  const sequence: ControlSignal[][] = [];
  for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
    const intent = tick < IMPACT_TICK ? { forward: 0, turn: 0 } : { forward: 1, turn: 0 };
    const joints = new Map<string, JointFeedback>();
    for (const joint of blueprint.actuators ?? []) {
      if (joint.kind === 'tension') continue;
      joints.set(joint.id, {
      angle: physics.readJointPosition(body, joint.connectionId),
      angularVelocity: physics.readJointVelocity(body, joint.connectionId),
      });
    }
    const signals = controller.update(STEP, body.readPartPose('part-core'), intent, { joints });
    const driveSignals = getActiveBodyAssemblies().map((assembly) => {
      const x = parts.get(assembly.partIds[0])!.pose.position.x;
      return createControlSignal(`actuator-${assembly.connectionIds[2]}`, Math.max(-1, Math.min(1, 0.03 * intent.forward + intent.turn * Math.sign(x))));
    });
    const frame = [...signals, ...driveSignals, createControlSignal('actuator-connection-4', intent.turn)];
    sequence.push(frame);
    actuator.step(frame, STEP);
    physics.step(STEP);
  }
  return sequence;
}

interface TrialResult {
  readonly separated: boolean;
  readonly separationTick: number;
  readonly separationImpulse: number;
  readonly anchorGap: number;
  readonly maxPartDistance: number;
  readonly finalX: number;
  readonly finalY: number;
  readonly finalZ: number;
  readonly forwardProgress: number;
  readonly meanHeight: number;
}

async function trial(signals: readonly (readonly ControlSignal[])[], strengthImpulseNs: number, impact: { x: number; y: number; z: number }, stopTick = TOTAL_TICKS): Promise<TrialResult> {
  const original = createActiveBlueprint();
  const blueprint: Blueprint = {
    ...original,
    connections: original.connections.map((connection) => connection.id === 'connection-0-a'
      ? { ...connection, strengthImpulseNs } : connection),
  };
  const { physics, body, actuator } = await setup(blueprint);
  const damage = new StructuralDamageRuntime(blueprint, physics, body);
  let zAtImpact = 0;
  let heightSum = 0;
  let separationTick = -1;
  let separationImpulse = 0;
  let maxPartDistance = 0;
  for (let tick = 0; tick < stopTick; tick += 1) {
    if (tick === IMPACT_TICK) {
      zAtImpact = body.readPartPose('part-core').position.z;
      if (Math.hypot(impact.x, impact.y, impact.z) > 0) {
        physics.applyImpulse(body.partHandles.get('part-1-a')!, impact);
        physics.applyImpulse(body.partHandles.get('part-core')!, { x: -impact.x, y: -impact.y, z: -impact.z });
      }
    }
    actuator.step(signals[tick], STEP);
    physics.step(STEP);
    const events = damage.afterPhysicsStep(tick);
    for (const event of events) if (event.connectionId === 'connection-0-a' && event.kind === 'separation') {
      separationTick = tick;
      separationImpulse = event.impulseNs;
    }
    const coreNow = body.readPartPose('part-core').position;
    const segmentNow = body.readPartPose('part-1-a').position;
    maxPartDistance = Math.max(maxPartDistance, Math.hypot(segmentNow.x - coreNow.x, segmentNow.y - coreNow.y, segmentNow.z - coreNow.z));
    if (tick >= IMPACT_TICK) heightSum += body.readPartPose('part-core').position.y;
  }
  const core = body.readPartPose('part-core').position;
  const segment = body.readPartPose('part-1-a').position;
  const dx = segment.x - core.x;
  const dy = segment.y - core.y;
  const dz = segment.z - core.z;
  return {
    separated: !damage.state.connections['connection-0-a'].connected,
    separationTick, separationImpulse,
    anchorGap: Math.hypot(dx, dy, dz),
    maxPartDistance,
    finalX: core.x, finalY: core.y, finalZ: core.z,
    forwardProgress: zAtImpact - core.z,
    meanHeight: heightSum / (stopTick - IMPACT_TICK),
  };
}

describe('Phase 3 active structure dependency', () => {
  it('physically separates after a strong impact while replaying identical controller signals', async () => {
    const signals = await recordIdenticalSignals();
    const intact = await trial(signals, 1, { x: 0, y: 0, z: 0 });
    const weakImpact = await trial(signals, 1, { x: 0, y: 0, z: -0.2 }, 150);
    const strongConnection = await trial(signals, 100, { x: 0, y: 0, z: -3 });
    const damaged = await trial(signals, 1, { x: 0, y: 0, z: -3 });
    expect(intact.separated).toBe(false);
    expect(intact.forwardProgress).toBeGreaterThan(1);
    expect(weakImpact.separated).toBe(false);
    expect(strongConnection.separated).toBe(false);
    expect(damaged.separated).toBe(true);
    expect(damaged.separationTick).toBe(IMPACT_TICK);
    expect(damaged.maxPartDistance).toBeGreaterThan(2);
    expect(damaged.forwardProgress).toBeLessThan(strongConnection.forwardProgress - 0.5);
    expect(damaged.meanHeight).toBeLessThan(strongConnection.meanHeight - 0.05);
  });
});
