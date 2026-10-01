import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { Decision, DecisionPolicy, DecisionPolicyInput, SkillName } from '../core/brainPolicy';
import type { AgentPerceptionView } from '../core/sensing';
import { LEOPARD_LEG_MECHANICS } from './LeopardBlueprint';
import {ContactSkillRuntime} from '../simulation/ContactSkillRuntime';
import { BrainRuntime, type BrainSnapshot, type SkillIntent } from '../simulation/BrainRuntime';

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

export type LeopardGaitKind = 'traction' | 'phase-sine';

/** Body-owned locomotion states, driven by gait phase plus sensed paw contact and joint state. */
export type LeopardLegGaitMode = 'hold' | 'stance' | 'swing' | 'seek';

export interface LeopardLegGaitSnapshot {
  readonly leg: string;
  readonly mode: LeopardLegGaitMode;
  readonly stanceEpisodes: number;
  readonly swings: number;
}

type LegPrefix = 'leopard-front-left' | 'leopard-front-right' | 'leopard-hind-left' | 'leopard-hind-right';

interface LegPart {
  readonly prefix: LegPrefix;
  readonly end: 'front' | 'hind';
  readonly side: 'left' | 'right';
}

const LEG_PARTS: readonly LegPart[] = [
  { prefix: 'leopard-front-left', end: 'front', side: 'left' },
  { prefix: 'leopard-front-right', end: 'front', side: 'right' },
  { prefix: 'leopard-hind-left', end: 'hind', side: 'left' },
  { prefix: 'leopard-hind-right', end: 'hind', side: 'right' },
];

/** Everything the motor layer may know: measured joints, orientation, anonymous returns, contacts. */
interface MotorFrame {
  readonly brain: BrainSnapshot;
  readonly joints: ReadonlyMap<string, readonly number[]>;
  readonly intent: SkillIntent;
  readonly moving: boolean;
  readonly turn: number;
  readonly pitch: number;
  readonly roll: number;
  readonly targetSide: number;
  readonly targetDistance: number;
  readonly contact: (prefix: LegPrefix) => boolean;
}

function buildFrame(brain: BrainSnapshot): MotorFrame {
  const joints = new Map(brain.selfModel.joints.map((joint) => [joint.connectionId, joint.value]));
  const intent = brain.skillIntent;
  const moving = intent.skill === 'approach' || intent.skill === 'interact' || intent.skill === 'turn';
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
  const observed = new Set(brain.selfModel.observedSensorIds);
  const contact = (prefix: LegPrefix): boolean => observed.has(prefix + '-paw-contact');
  return { brain, joints, intent, moving, turn, pitch, roll, targetSide, targetDistance, contact };
}

function jointCommand(signals: ControlSignal[], frame: MotorFrame, actuatorId: string,
  connectionId: string, target: number, gain = 3.5, coordinate = 0, velocityGain = 0.28): void {
  const state = frame.joints.get(connectionId);
  if (!state || !Number.isFinite(state[coordinate]) || !Number.isFinite(state[coordinate + 1])) return;
  signals.push(createControlSignal(actuatorId,
    clamp(gain * (target - state[coordinate]) - velocityGain * state[coordinate + 1])));
}

/** Two-link body geometry; targets remain joint efforts through ordinary actuators. */
function legAngles(x: number, down: number): { hip: number; knee: number; ankle: number } {
  const { upperLength: upper, lowerLength: lower } = LEOPARD_LEG_MECHANICS;
  const cosine = Math.max(-1, Math.min(1, (x*x + down*down - upper*upper - lower*lower)/(2*upper*lower)));
  const knee = -Math.acos(cosine);
  const hip = Math.atan2(x, down) - Math.atan2(lower*Math.sin(knee), upper+lower*Math.cos(knee));
  return { hip, knee, ankle: -hip-knee };
}

function tractionJointCommand(signals: ControlSignal[], frame: MotorFrame, actuatorId: string,
  connectionId: string, target: number, supportRatio: number, gain: number, damping: number): void {
  const state = frame.joints.get(connectionId);
  if (!state) return;
  signals.push(createControlSignal(actuatorId,
    clamp(gain*(target-state[0]) + supportRatio*state[0] - damping*state[1])));
}

/** Spine, neck and jaw targets are shared by both gaits; they never touch torso translation. */
function torsoCommands(signals: ControlSignal[], frame: MotorFrame, yawDamping = 0,
  turnScale = 0.65): void {
  jointCommand(signals, frame, 'leopard-spine-pitch', 'leopard-spine-joint', -frame.pitch * 0.12, 1.8);
  jointCommand(signals, frame, 'leopard-spine-yaw', 'leopard-spine-joint',
    -frame.turn * turnScale + yawDamping * 0.3, 3, 4);
  jointCommand(signals, frame, 'leopard-neck-pitch', 'leopard-neck-joint',
    frame.intent.skill === 'interact' ? 0.25 : 0.02, 1.8);
  jointCommand(signals, frame, 'leopard-jaw-close', 'leopard-jaw-joint',
    frame.intent.skill === 'interact' ? 0.30 : -0.12, 2);
}

/**
 * The v0.3 phase-sine motor, kept only as a measurement baseline for traction work.
 * Targets are continuous sinusoids; contact sensing does not gate the leg cycle.
 */
class PhaseSineGait {
  private phase = 0;

  update(frame: MotorFrame, seconds: number): readonly ControlSignal[] {
    const signals: ControlSignal[] = [];
    if (frame.moving) this.phase = (this.phase + seconds * Math.PI * 2 * 1.2) % (Math.PI * 2);
    for (const leg of LEG_PARTS) {
      const { prefix, end, side } = leg;
      const sideSign = side === 'left' ? -1 : 1;
      const phase = this.phase + ((end === 'front') === (side === 'left') ? 0 : Math.PI);
      const stride = frame.moving ? Math.sin(phase) : 0;
      const footContact = frame.contact(prefix);
      const reaching = frame.intent.skill === 'interact' && end === 'front';
      const kneeAngle = frame.joints.get(prefix + '-knee-joint')?.[0] ?? 0;
      const lifting = reaching && !footContact && kneeAngle < 0.35;
      const bracing = reaching && !lifting;
      const strideScale = frame.intent.skill === 'turn' ? sideSign * frame.turn : 1 + sideSign * frame.turn * 0.8;
      const reachBias = reaching ? frame.targetSide * sideSign * 0.18 : 0;
      const hipTarget =
        (end === 'hind' ? 0.6 : 0.25) * stride * strideScale
        + (bracing ? 1.1 + Math.max(0, 0.45 - frame.targetDistance) * 0.12 + reachBias : reaching ? 0.28 : 0)
        + (end === 'front' ? -frame.pitch : frame.pitch) * 0.15 + sideSign * frame.roll * 0.18;
      const kneeTarget = bracing
        ? 0.9 + Math.max(0, 0.45 - frame.targetDistance) * 0.08
        : reaching ? (lifting ? 0.62 : 0.12)
        : -0.08 - (frame.moving ? 0.55 * Math.max(0, stride) : 0);
      const rollTarget = -sideSign * (reaching ? 0.3 : 0.1)
        + (frame.intent.skill === 'stand' ? 1.2 * frame.roll : 0)
        + (reaching ? frame.targetSide * sideSign * 0.2 : 0) - frame.turn * 0.12;
      const yawTarget = -frame.turn * (end === 'front' ? 0.45 : -0.3)
        + (reaching ? frame.targetSide * sideSign * 0.14 : 0)
        + (frame.moving ? 0.08 * stride : 0);
      const reachGain = bracing ? 0.8 : 3.5;
      const reachVelocityGain = bracing ? 0.6 : 0.28;
      jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint', hipTarget,
        reachGain, 0, reachVelocityGain);
      jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget,
        bracing ? 1.4 : 2.5, 2, reachVelocityGain);
      jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget,
        bracing ? 1.4 : 2.5, 4, reachVelocityGain);
      jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint', kneeTarget,
        reachGain, 0, reachVelocityGain);
      if (frame.joints.has(prefix + '-paw')) {
        const ankleTarget = frame.moving ? 0.15 + sideSign * frame.turn * 0.08
          : frame.intent.skill === 'stand' && frame.brain.selfModel.stability.level === 'stable' && footContact ? -0.04 : 0;
        signals.push(createControlSignal(prefix + '-ankle', clamp(ankleTarget)));
      }
    }
    torsoCommands(signals, frame);
    return signals;
  }
}

interface LegCycleState {
  mode: LeopardLegGaitMode;
  modeSeconds: number;
  swingWindowUsed: boolean;
  /** Touchdown is only valid after this swing actually lost sensed contact. */
  hasLifted: boolean;
  swingAirborneSeconds: number;
  liftOffSeconds: number;
  /** Hip pitch measured at the current mode's entry; stance retracts away from it. */
  anchorHipPitch: number;
  /** Knee angle captured with the hip so each mode starts at its measured foot position. */
  anchorKneePitch: number;
  /** Integrated foot retraction in metres, matched to measured body speed. */
  sweepPosition: number;
  /** Consecutive airborne time inside stance, debouncing 1-tick contact flicker. */
  airborneSeconds: number;
  stanceEpisodes: number;
  swings: number;
}

const TRACTION = {
  cycleHz: 0.5,
  /** Phase span of one diagonal group's swing window. */
  swingSpan: 3.0,
  /** A swing accepts touchdown only after its lift apex, so lift-off can clear the paw. */
  touchdownProgress: 0.85,
  minSwingSeconds: 0.05,
  minStanceSeconds: 0.12,
  seekMaxSeconds: 0.9,
  /** Cap on the proprioceptive forward speed used to match the stance sweep. */
  speedCap: 0.22,
};

export type TractionTuning = Partial<{ [K in keyof typeof TRACTION]: (typeof TRACTION)[K] }>;

/**
 * Contact-gated diagonal gait. Swing legs flex and advance; stance legs retract the
 * leg so the planted paw stays near its ground point while the torso passes over.
 * Lift-off is postponed until the opposite diagonal pair reports contact, a touchdown after measured lift
 * starts stance, and a stance leg that loses ground seeks it
 * again. No torso force, paw world pose, or scripted timeline is used.
 */
class TractionGait {
  private phase = 0;
  private running = false;
  private smoothTurn = 0;
  /** Root forward speed measured only through proprioceptive local velocity. */
  private measuredSpeed = 0;
  private readonly params: Readonly<typeof TRACTION>;
  private readonly legs = new Map<LegPrefix, LegCycleState>(
    LEG_PARTS.map(({ prefix }) => [prefix, {
      mode: 'hold', modeSeconds: 0, swingWindowUsed: false, anchorHipPitch: 0, stanceEpisodes: 0, swings: 0,
      hasLifted: false, swingAirborneSeconds: 0, liftOffSeconds: 0, anchorKneePitch: 0, sweepPosition: 0, airborneSeconds: 0,
    } as LegCycleState]),
  );

  constructor(tuning: TractionTuning = {}) {
    this.params = { ...TRACTION, ...tuning } as typeof TRACTION;
  }

  private inSwingWindow(prefix: LegPrefix): boolean {
    const end = prefix.includes('front') ? 'front' : 'hind';
    const side = prefix.includes('left') ? 'left' : 'right';
    return (this.phase + ((end === 'front') === (side === 'left') ? 0 : Math.PI)) % (Math.PI * 2) < this.params.swingSpan;
  }

  /** Both legs of the opposite diagonal pair must sense contact before lift-off. */
  private oppositePairGrounded(frame: MotorFrame, prefix: LegPrefix): boolean {
    const end = prefix.includes('front') ? 'front' : 'hind';
    const side = prefix.includes('left') ? 'left' : 'right';
    return LEG_PARTS.filter((other) => (other.end === end) !== (other.side === side))
      .every((other) => frame.contact(other.prefix));
  }

  update(frame: MotorFrame, seconds: number): readonly ControlSignal[] {
    const orientation = frame.brain.selfModel.orientation?.value;
    const upY = orientation ? 1 - 2 * (orientation[0] ** 2 + orientation[2] ** 2) : 1;
    // Self-righting clock: when badly rolled in hold, rock the body with the
    // same generic joints; this path never runs during locomotion.
    const righting = upY < 0.5;
    if (!righting && frame.moving) {
      this.phase = (this.phase + seconds * Math.PI * 2 * this.params.cycleHz) % (Math.PI * 2);
    } else if (righting) {
      this.phase = (this.phase + seconds * Math.PI * 2 * 0.9) % (Math.PI * 2);
    }
    if (frame.moving !== this.running) {
      this.running = frame.moving;
      if (frame.moving) for (const [prefix, state] of this.legs) {
        const startSwing = this.inSwingWindow(prefix);
        state.hasLifted = false;
        state.swingAirborneSeconds = 0;
        state.mode = startSwing ? 'swing' : 'stance';
        state.modeSeconds = 0;
        state.anchorHipPitch = frame.joints.get(prefix + '-hip-joint')?.[0] ?? 0;
        state.anchorKneePitch = frame.joints.get(prefix + '-knee-joint')?.[0] ?? 0;
        state.sweepPosition = 0;
        state.airborneSeconds = 0;
        state.swingWindowUsed = startSwing;
      }
    }
    // Turn intent is damped at the body so sensor jitter cannot yank the spine.
    this.smoothTurn += (frame.turn - this.smoothTurn) * Math.min(1, seconds * 2.5);
    const localSpeed = frame.brain.selfModel.localVelocity?.value[0];
    const lateralSpeed = frame.brain.selfModel.localVelocity?.value[2] ?? 0;
    if (localSpeed !== undefined && Number.isFinite(localSpeed)) {
      this.measuredSpeed += (Math.max(-0.2, Math.min(this.params.speedCap, localSpeed)) - this.measuredSpeed)
        * Math.min(1, seconds * 2);
    }
    const yawRate = frame.brain.selfModel.angularVelocity?.value[1] ?? 0;
    const signals: ControlSignal[] = [];
    for (const leg of LEG_PARTS) {
      const { prefix, end, side } = leg;
      const sideSign = side === 'left' ? -1 : 1;
      const state = this.legs.get(prefix)!;
      const footContact = frame.contact(prefix);
      const kneeAngle = frame.joints.get(prefix + '-knee-joint')?.[0] ?? 0;
      const torsoPitch = frame.pitch + (end === 'hind' ? frame.joints.get('leopard-spine-joint')?.[0] ?? 0 : 0);
      const hipPitch = frame.joints.get(prefix + '-hip-joint')?.[0] ?? 0;
      const previousMode = state.mode;
      if (!this.inSwingWindow(prefix)) state.swingWindowUsed = false;
      state.modeSeconds += seconds;
      const enterStance = (): void => {
        state.mode = 'stance';
        state.modeSeconds = 0;
        state.anchorHipPitch = hipPitch;
        state.anchorKneePitch = kneeAngle;
        state.sweepPosition = 0;
        state.airborneSeconds = 0;
        state.stanceEpisodes += 1;
      };

      // Near-contact intent adjusts the limb orientation while the same gait
      // continues carrying the front body; both forelegs must not stop supporting it.
      const reaching = frame.intent.skill === 'interact' && end === 'front';
      const swingWindowSeconds = this.params.swingSpan / (Math.PI * 2 * this.params.cycleHz);
      if (righting) {
        state.mode = 'hold';
      } else if (!frame.moving) {
        state.mode = 'hold';
      } else if (state.mode === 'hold') {
        state.mode = this.inSwingWindow(prefix) ? 'swing' : 'stance';
        state.modeSeconds = 0;
        state.anchorHipPitch = hipPitch;
        state.anchorKneePitch = kneeAngle;
        state.sweepPosition = 0;
        state.airborneSeconds = 0;
      } else if (state.mode === 'stance') {
        state.airborneSeconds = footContact ? 0 : state.airborneSeconds + seconds;
        if (this.inSwingWindow(prefix)) {
          if (!state.swingWindowUsed && this.oppositePairGrounded(frame, prefix) && state.modeSeconds >= this.params.minStanceSeconds) {
            state.mode = 'swing';
            state.modeSeconds = 0;
            state.anchorHipPitch = hipPitch;
            state.swings += 1;
          }
        } else if (!footContact && state.airborneSeconds >= 0.05
          && state.modeSeconds >= this.params.minStanceSeconds) {
          state.mode = 'seek';
          state.modeSeconds = 0;
          state.anchorHipPitch = hipPitch;
        }
      } else if (state.mode === 'swing') {
        state.swingAirborneSeconds = footContact ? 0 : state.swingAirborneSeconds + seconds;
        if (!state.hasLifted && state.swingAirborneSeconds >= this.params.minSwingSeconds) {
          state.hasLifted = true;
          state.liftOffSeconds = state.modeSeconds;
        }
        if (state.hasLifted && footContact
          && state.modeSeconds >= this.params.minSwingSeconds
          && state.modeSeconds / swingWindowSeconds >= this.params.touchdownProgress) {
          enterStance();
        } else if (!this.inSwingWindow(prefix) && state.modeSeconds >= swingWindowSeconds + 0.12) {
          state.mode = 'seek';
          state.modeSeconds = 0;
          state.anchorHipPitch = hipPitch;
        }
      } else if (state.mode === 'seek') {
        if (footContact) {
          enterStance();
        } else if (state.modeSeconds >= this.params.seekMaxSeconds) {
          state.mode = 'swing';
          state.modeSeconds = 0;
          state.anchorHipPitch = hipPitch;
          state.swings += 1;
        }
      }

      if (state.mode === 'swing' && previousMode !== 'swing') {
        state.swingWindowUsed = true;
        state.anchorKneePitch = kneeAngle;
        state.hasLifted = false;
        state.swingAirborneSeconds = 0;
      }

      const turn = this.smoothTurn;
      const strideScale = frame.intent.skill === 'turn' ? sideSign * turn : 1 + sideSign * turn * 0.8;
      const approachGentle = frame.intent.skill === 'interact' ? 0.55 : 1;
      const speedMatchedRate = Math.max(0.14, Math.min(0.24, this.measuredSpeed+0.02)) * approachGentle;
      const postureHip = (end === 'front' ? -frame.pitch : frame.pitch) * 0.15 + sideSign * frame.roll * 0.18;
      const rollTarget = (state.mode === 'hold' ? 1.2 * frame.roll : -sideSign*0.04)
        + (reaching ? frame.targetSide * sideSign * 0.2 : 0) - turn * 0.12;
      const yawTarget = -turn * (end === 'front' ? 0.6 : -0.3) + yawRate * 0.25
        - lateralSpeed * 0.8 * (end === 'front' ? 1 : -0.5)
        + (reaching ? frame.targetSide * sideSign * 0.14 : 0);

      if (righting) {
        // Rock and tuck to roll back onto the feet: alternating hip roll with a
        // curled posture, driven only by sensed orientation and the phase clock.
        const rock = Math.sin(this.phase);
        jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint',
          (end === 'front' ? -0.3 : 0.3) * (0.5 + 0.5 * rock) + postureHip, 2.6);
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint',
          sideSign * 0.45 * rock - frame.roll * 0.8, 2.6, 2);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', 0, 2.5, 4);
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint', 0.35, 2.6);
      } else if (state.mode === 'hold') {
        jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint', postureHip, 3.5);
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget, 2.5, 2);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget, 2.5, 4);
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint', 0, 3.5);
      } else {
        const swingSeconds = swingWindowSeconds;
        let x: number;
        let down: number;
        if (state.mode === 'stance') {
          state.sweepPosition += speedMatchedRate * strideScale * seconds;
          x = LEOPARD_LEG_MECHANICS.upperLength * Math.sin(state.anchorHipPitch)
            + LEOPARD_LEG_MECHANICS.lowerLength * Math.sin(state.anchorHipPitch + state.anchorKneePitch) - state.sweepPosition;
          x = Math.max(-0.15, Math.min(0.16, x));
          down = 0.70;
        } else if (state.mode === 'swing') {
          const progress = Math.min(1, state.modeSeconds / swingSeconds);
          const startX = LEOPARD_LEG_MECHANICS.upperLength * Math.sin(state.anchorHipPitch)
            + LEOPARD_LEG_MECHANICS.lowerLength * Math.sin(state.anchorHipPitch + state.anchorKneePitch);
          const advance = state.hasLifted
            ? Math.min(1, Math.max(0, (state.modeSeconds-state.liftOffSeconds)/(swingSeconds*0.3))) : 0;
          const touchdownX = Math.max(-0.16, Math.min(0.16, 0.12*strideScale));
          x = startX + (touchdownX-startX)*advance
            - Math.max(0, progress-0.8)*swingSeconds*Math.max(0,this.measuredSpeed);
          down = 0.70 - 0.14*Math.max(0, Math.min(1, progress/0.25, (1-progress)/0.25));
        } else {
          x = 0.12;
          down = 0.70 + Math.min(0.025, state.modeSeconds*0.03);
        }
        const targets = legAngles(x*Math.cos(torsoPitch)-down*Math.sin(torsoPitch),
          down*Math.cos(torsoPitch)+x*Math.sin(torsoPitch));
        tractionJointCommand(signals, frame, prefix+'-hip', prefix+'-hip-joint', targets.hip+sideSign*frame.roll*0.18,
          LEOPARD_LEG_MECHANICS.hipStiffness / LEOPARD_LEG_MECHANICS.hipMaxTorque, 4, 0.12);
        tractionJointCommand(signals, frame, prefix+'-knee', prefix+'-knee-joint', targets.knee,
          LEOPARD_LEG_MECHANICS.kneeStiffness / LEOPARD_LEG_MECHANICS.kneeMaxTorque, 4, 0.12);
        jointCommand(signals, frame, prefix+'-hip-roll', prefix+'-hip-joint', rollTarget, 2.8, 2, 0.4);
        jointCommand(signals, frame, prefix+'-hip-yaw', prefix+'-hip-joint', yawTarget, 2.5, 4, 0.4);
      }

      if (frame.joints.has(prefix + '-paw')) {
        const ankleState = frame.joints.get(prefix + '-paw');
        const ankleAngle = ankleState?.[0] ?? 0;
        const ankleVelocity = ankleState?.[1] ?? 0;
        if (state.mode === 'swing' || state.mode === 'seek' || state.mode === 'stance') {
          const target = Math.max(-0.9, Math.min(0.9, -hipPitch-kneeAngle-torsoPitch));
          tractionJointCommand(signals, frame, prefix+'-ankle', prefix+'-paw', target, LEOPARD_LEG_MECHANICS.ankleStiffness / LEOPARD_LEG_MECHANICS.ankleMaxTorque, 4, 0.06);
        } else {
          signals.push(createControlSignal(prefix+'-ankle', clamp(-1.2*ankleAngle-0.2*ankleVelocity)));
        }
      }
    }
    torsoCommands(signals, frame, yawRate, 0.45);
    return signals;
  }

  inspect(): readonly LeopardLegGaitSnapshot[] {
    return LEG_PARTS.map(({ prefix }) => {
      const state = this.legs.get(prefix)!;
      return { leg: prefix, mode: state.mode, stanceEpisodes: state.stanceEpisodes, swings: state.swings };
    });
  }
}

/** One instance per Entity. No world/physics object is reachable by the Brain or motor layer. */
export class LeopardAgentRuntime {
  private readonly brain: BrainRuntime;
  private readonly motor: TractionGait | PhaseSineGait;
  private readonly traction: TractionGait;
  private snapshot: LeopardAgentSnapshot = {
    goal: '等待感知', skill: 'stand', stability: 'unknown', perceptionTick: -1, decisionCount: 0,
  };
  private lastDecisionKey = '';
  private readonly decisionHistory: LeopardDecisionRecord[] = [];

  constructor(gait: LeopardGaitKind = 'traction', tuning: TractionTuning = {}, policy: DecisionPolicy = new EngagementDecisionPolicy(), private readonly contactSkill?: ContactSkillRuntime) {
    this.brain = new BrainRuntime(policy, 4);
    this.traction = new TractionGait(tuning);
    this.motor = gait === 'phase-sine' ? new PhaseSineGait() : this.traction;
  }

  control(view: AgentPerceptionView, seconds: number): readonly ControlSignal[] {
    if (view.tick < 0) return [];
    const brain = this.brain.update(view);
    const decisionKey = brain.decision?.goal.kind + ':' + brain.skillIntent.skill;
    const decisionCount = this.snapshot.decisionCount + Number(decisionKey !== this.lastDecisionKey);
    if (decisionKey !== this.lastDecisionKey) {
      this.decisionHistory.push({ tick: view.tick, goal: brain.decision?.goal.kind ?? 'none',
        skill: brain.skillIntent.skill });
      if (this.decisionHistory.length > 128) this.decisionHistory.shift();
    }
    this.lastDecisionKey = decisionKey;
    this.snapshot = { goal: brain.decision?.goal.kind ?? 'none', skill: brain.skillIntent.skill,
      stability: brain.selfModel.stability.level, perceptionTick: view.tick, decisionCount };
    const signals=this.motor.update(buildFrame(brain), seconds);
    if(!this.contactSkill || brain.skillIntent.skill!=='interact')return signals;
    const contact=this.contactSkill.update(view);
    const owned=new Set(this.contactSkill.binding.axes.map(a=>a.actuatorId));
    return [...signals.filter(s=>!owned.has(s.actuatorId)),...contact];
  }

  inspectContactExperience() { return this.contactSkill?.inspect(); }

  inspect(): LeopardAgentSnapshot { return { ...this.snapshot }; }

  /** Per-leg locomotion states; empty for the phase-sine baseline, which has none. */
  inspectGaitStates(): readonly LeopardLegGaitSnapshot[] {
    return this.motor === this.traction ? this.traction.inspect() : [];
  }

  inspectDecisionHistory(): readonly LeopardDecisionRecord[] { return this.decisionHistory.map((entry) => ({ ...entry })); }
}
