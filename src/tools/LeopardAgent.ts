import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { Decision, DecisionPolicy, DecisionPolicyInput, SkillName } from '../core/brainPolicy';
import type { AgentPerceptionView } from '../core/sensing';
import { BrainRuntime, type BrainSnapshot } from '../simulation/BrainRuntime';

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

/** A replaceable policy that knows only anonymous sensor returns and its own measured state. */
export class EngagementDecisionPolicy implements DecisionPolicy {
  evaluate({ selfModel, worldModel }: DecisionPolicyInput): Decision {
    const orientation = selfModel.orientation?.value;
    const upY = orientation
      ? 1 - 2 * (orientation[0] ** 2 + orientation[2] ** 2) : 1;
    if (upY < 0.9 || selfModel.stability.level === 'unstable' || selfModel.feedbackGapRecent) {
      return { goal: { kind: 'maintain-stability', desiredState: 'recover a usable posture' },
        affordance: { id: 'recover-posture', goalKind: 'maintain-stability', skill: 'stand' } };
    }
    const currentReturns = worldModel.ranges
      .filter((sample) => sample.expiresAtTick >= worldModel.tick && sample.localDirection[0] > 0.35)
      .sort((a, b) => a.distance - b.distance);
    const nearest = currentReturns[0];
    const nearDirections = nearest ? currentReturns.filter((sample) => sample.distance <= nearest.distance + 0.35) : [];
    const meanSide = nearDirections.length
      ? nearDirections.reduce((sum, sample) => sum + sample.localDirection[2], 0) / nearDirections.length : 0;
    const turn = clamp(-meanSide * 1.2);
    if (nearest && nearest.distance < 0.45) {
      return { goal: { kind: 'interact-near-contact', desiredState: 'make physical contact near the head' },
        affordance: { id: 'head-and-forelimb-contact', goalKind: 'interact-near-contact',
          skill: 'interact', parameters: { turn } } };
    }
    if (nearest) {
      return { goal: { kind: 'approach-anonymous-return', desiredState: 'closer to a sensed return' },
        affordance: { id: 'approach-range-return', goalKind: 'approach-anonymous-return',
          skill: 'approach', parameters: { turn } } };
    }
    return { goal: { kind: 'continue-exploration', desiredState: 'new local observations' },
      affordance: { id: 'search-by-turning', goalKind: 'continue-exploration', skill: 'turn',
        parameters: { turn: 0.45 } } };
  }
}

export interface LeopardAgentSnapshot {
  readonly goal: string;
  readonly skill: SkillName;
  readonly stability: string;
  readonly perceptionTick: number;
  readonly decisionCount: number;
}

export interface LeopardDecisionRecord {
  readonly tick: number;
  readonly goal: string;
  readonly skill: SkillName;
}

/** The fixture's body-owned motor mapping converts intent to ordinary joint actuator signals. */
class LeopardMotorRuntime {
  private phase = 0;

  update(brain: BrainSnapshot, seconds: number): readonly ControlSignal[] {
    const joints = new Map(brain.selfModel.joints.map((joint) => [joint.connectionId, joint.value]));
    const intent = brain.skillIntent;
    const moving = intent.skill === 'approach' || intent.skill === 'interact' || intent.skill === 'turn';
    if (moving) this.phase = (this.phase + seconds * Math.PI * 2 * 1.2) % (Math.PI * 2);
    const turnScale = intent.skill === 'turn' ? 1.15 : 1;
    const turn = clamp(turnScale * (intent.turn ?? (intent.skill === 'turn' ? 0.45 : 0)));
    const orientation = brain.selfModel.orientation?.value;
    const roll = orientation ? 2 * (orientation[3] * orientation[0] + orientation[1] * orientation[2]) : 0;
    const pitch = orientation ? 2 * (orientation[3] * orientation[2] - orientation[0] * orientation[1]) : 0;
    const currentReturns = brain.worldModel.ranges
      .filter((sample) => sample.expiresAtTick >= brain.worldModel.tick && sample.localDirection[0] > 0.35)
      .sort((a, b) => a.distance - b.distance);
    const nearest = currentReturns[0];
    const nearDirections = nearest ? currentReturns.filter((sample) => sample.distance <= nearest.distance + 0.35) : [];
    const targetSide = clamp(nearDirections.length
      ? nearDirections.reduce((sum, sample) => sum + sample.localDirection[2], 0) / nearDirections.length : 0);
    const targetDistance = nearest?.distance ?? 2;
    const observedSensors = new Set(brain.selfModel.observedSensorIds);
    const contactFor = (prefix: string): boolean => observedSensors.has(`${prefix}-paw-contact`);
    const signals: ControlSignal[] = [];
    const command = (actuatorId: string, connectionId: string, target: number,
      gain = 3.5, coordinate = 0, velocityGain = 0.28): void => {
      const state = joints.get(connectionId);
      if (!state || !Number.isFinite(state[coordinate]) || !Number.isFinite(state[coordinate + 1])) return;
      signals.push(createControlSignal(actuatorId,
        clamp(gain * (target - state[coordinate]) - velocityGain * state[coordinate + 1])));
    };
    for (const end of ['front', 'hind'] as const) {
      for (const side of ['left', 'right'] as const) {
        const prefix = `leopard-${end}-${side}`;
        const sideSign = side === 'left' ? -1 : 1;
        const phase = this.phase + ((end === 'front') === (side === 'left') ? 0 : Math.PI);
        const stride = moving ? Math.sin(phase) : 0;
        const footContact = contactFor(prefix);
        const reaching = intent.skill === 'interact' && end === 'front';
        const kneeState = joints.get(`${prefix}-knee-joint`);
        const kneeAngle = kneeState?.[0] ?? 0;
        // A sensed paw contact and the measured knee coordinate select the
        // lift/extend transition. No combat timeline or opponent identity is
        // required: once the knee has visibly cleared its supported posture,
        // the same actuators can extend and brace toward the anonymous return.
        const lifting = reaching && !footContact && kneeAngle < 0.35;
        const bracing = reaching && !lifting;
        const strideScale = intent.skill === 'turn' ? sideSign * turn : 1 + sideSign * turn * 0.8;
        const reachBias = reaching ? targetSide * sideSign * 0.18 : 0;
        const hipTarget =
          (end === 'hind' ? 0.6 : 0.25) * stride * strideScale
          + (bracing ? 1.1 + Math.max(0, 0.45 - targetDistance) * 0.12 + reachBias : reaching ? 0.28 : 0)
          + (end === 'front' ? -pitch : pitch) * 0.15 + sideSign * roll * 0.18;
        const kneeTarget = bracing
          ? 0.9 + Math.max(0, 0.45 - targetDistance) * 0.08
          : reaching ? (lifting ? 0.62 : 0.12)
          : -0.08 - (moving ? 0.55 * Math.max(0, stride) : 0);
        // Spherical joints expose pitch, roll and yaw through the same physical
        // connection. These are ordinary actuator targets based on sensed
        // joint coordinates; ground contact determines whether they turn or reach.
        const rollTarget = -sideSign * (reaching ? 0.3 : 0.1)
          + (intent.skill === 'stand' ? 1.2 * roll : 0)
          + (reaching ? targetSide * sideSign * 0.2 : 0) - turn * 0.12;
        const yawTarget = -turn * (end === 'front' ? 0.45 : -0.3)
          + (reaching ? targetSide * sideSign * 0.14 : 0)
          + (moving ? 0.08 * stride : 0);
        const reachGain = bracing ? 0.8 : 3.5;
        const reachVelocityGain = bracing ? 0.6 : 0.28;
        command(`${prefix}-hip`, `${prefix}-hip-joint`, hipTarget, reachGain, 0, reachVelocityGain);
        command(`${prefix}-hip-roll`, `${prefix}-hip-joint`, rollTarget, bracing ? 1.4 : 2.5, 2, reachVelocityGain);
        command(`${prefix}-hip-yaw`, `${prefix}-hip-joint`, yawTarget, bracing ? 1.4 : 2.5, 4, reachVelocityGain);
        command(`${prefix}-knee`, `${prefix}-knee-joint`, kneeTarget, reachGain, 0, reachVelocityGain);
        if (joints.has(`${prefix}-paw`)) {
          const ankleTarget = moving ? 0.15 + sideSign * turn * 0.08
            : intent.skill === 'stand' && brain.selfModel.stability.level === 'stable' && footContact ? -0.04 : 0;
          signals.push(createControlSignal(`${prefix}-ankle`, clamp(ankleTarget)));
        }
      }
    }
    command('leopard-spine-pitch', 'leopard-spine-joint', -pitch * 0.12, 1.8);
    command('leopard-spine-yaw', 'leopard-spine-joint', -turn * 0.65, 3, 4);
    command('leopard-neck-pitch', 'leopard-neck-joint', intent.skill === 'interact' ? 0.25 : 0.02, 1.8);
    command('leopard-jaw-close', 'leopard-jaw-joint', intent.skill === 'interact' ? 0.30 : -0.12, 2);
    return signals;
  }
}

/** One instance per Entity. No world/physics object is reachable by the Brain or motor layer. */
export class LeopardAgentRuntime {
  private readonly brain = new BrainRuntime(new EngagementDecisionPolicy(), 4);
  private readonly motor = new LeopardMotorRuntime();
  private snapshot: LeopardAgentSnapshot = {
    goal: '等待感知', skill: 'stand', stability: 'unknown', perceptionTick: -1, decisionCount: 0,
  };
  private lastDecisionKey = '';
  private readonly decisionHistory: LeopardDecisionRecord[] = [];

  control(view: AgentPerceptionView, seconds: number): readonly ControlSignal[] {
    if (view.tick < 0) return [];
    const brain = this.brain.update(view);
    const decisionKey = `${brain.decision?.goal.kind}:${brain.skillIntent.skill}`;
    const decisionCount = this.snapshot.decisionCount + Number(decisionKey !== this.lastDecisionKey);
    if (decisionKey !== this.lastDecisionKey) {
      this.decisionHistory.push({ tick: view.tick, goal: brain.decision?.goal.kind ?? 'none',
        skill: brain.skillIntent.skill });
      if (this.decisionHistory.length > 128) this.decisionHistory.shift();
    }
    this.lastDecisionKey = decisionKey;
    this.snapshot = { goal: brain.decision?.goal.kind ?? 'none', skill: brain.skillIntent.skill,
      stability: brain.selfModel.stability.level, perceptionTick: view.tick, decisionCount };
    return this.motor.update(brain, seconds);
  }

  inspect(): LeopardAgentSnapshot { return { ...this.snapshot }; }
  inspectDecisionHistory(): readonly LeopardDecisionRecord[] { return this.decisionHistory.map((entry) => ({ ...entry })); }
}
