import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { Decision, DecisionPolicy, DecisionPolicyInput, SkillName } from '../core/brainPolicy';
import type { AgentPerceptionView } from '../core/sensing';
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

/** Spine, neck and jaw targets are shared by both gaits; they never touch torso translation. */
function torsoCommands(signals: ControlSignal[], frame: MotorFrame, yawDamping = 0,
  turnScale = 0.65): void {
  jointCommand(signals, frame, 'leopard-spine-pitch', 'leopard-spine-joint', -frame.pitch * 0.12, 1.8);
  jointCommand(signals, frame, 'leopard-spine-yaw', 'leopard-spine-joint',
    -frame.turn * turnScale - yawDamping * 0.3, 3, 4);
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
  wasReaching: boolean;
  /** Hip pitch measured at the current mode's entry; stance retracts away from it. */
  anchorHipPitch: number;
  /** Knee angle at stance entry; the stance leg holds it like a rigid strut. */
  anchorKneePitch: number;
  /** Integrated stance sweep in radians, matched to measured body speed. */
  sweepPosition: number;
  /** Consecutive airborne time inside stance, debouncing 1-tick contact flicker. */
  airborneSeconds: number;
  /** Slew-limited stance hip effort, kept in the leg state to survive mode changes. */
  lastHipEffort: number;
  /** Low-pass filtered hip rate; raw per-tick rates destabilise the velocity servo. */
  filteredHipRate: number;
  stanceEpisodes: number;
  swings: number;
}

const TRACTION = {
  cycleHz: 0.7,
  /** Phase span of one diagonal group's swing window. */
  swingSpan: 1.6,
  /** Hip retraction rate while planted; positive pitch sweeps the paw backward. */
  retractRate: 0.55,
  stanceHipMin: -0.6,
  stanceHipMax: 0.6,
  touchdownPitch: { front: -0.32, hind: -0.24 } as const,
  swingKneeFlex: 0.25,
  stanceKnee: -0.12,
  stanceHipGain: 2.6,
  stanceVelocityGain: 0.55,
  swingHipGain: 2.6,
  swingKneeGain: 2.8,
  swingVelocityGain: 0.35,
  /** A swing accepts touchdown only after its lift apex, so lift-off can clear the paw. */
  touchdownProgress: 0.45,
  minSwingSeconds: 0.05,
  minStanceSeconds: 0.12,
  seekMaxSeconds: 0.9,
  /** Cap on the proprioceptive forward speed used to match the stance sweep. */
  speedCap: 0.22,
};

export type TractionTuning = Partial<{ [K in keyof typeof TRACTION]: (typeof TRACTION)[K] }>;

/**
 * Contact-gated diagonal gait. Swing legs flex and advance; stance legs retract the
 * hip so the planted paw stays near its ground point while the torso passes over.
 * Lift-off is postponed until the opposite diagonal pair reports contact, an early
 * touchdown starts stance immediately, and a stance leg that loses ground seeks it
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
      mode: 'hold', modeSeconds: 0, anchorHipPitch: 0, stanceEpisodes: 0, swings: 0,
      wasReaching: false, anchorKneePitch: 0, sweepPosition: 0, airborneSeconds: 0,
      lastHipEffort: 0, filteredHipRate: 0,
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

  /** True when any leg of the opposite diagonal pair currently senses contact. */
  private oppositePairGrounded(frame: MotorFrame, prefix: LegPrefix): boolean {
    const end = prefix.includes('front') ? 'front' : 'hind';
    const side = prefix.includes('left') ? 'left' : 'right';
    return LEG_PARTS.filter((other) => other.end !== end && other.side !== side)
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
        state.mode = startSwing ? 'swing' : 'stance';
        state.modeSeconds = 0;
        state.anchorHipPitch = frame.joints.get(prefix + '-hip-joint')?.[0] ?? 0;
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
      const hipPitch = frame.joints.get(prefix + '-hip-joint')?.[0] ?? 0;
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

      // Near an anonymous return the forelimbs stop stepping and reach toward it,
      // letting the hind legs push the body into contact. The Brain is unchanged.
      const reaching = frame.intent.skill === 'interact' && end === 'front';
      if (state.wasReaching && !reaching) {
        // Leaving a reach: re-ground from the current posture instead of a stale anchor.
        state.mode = 'seek';
        state.modeSeconds = 0;
        state.anchorHipPitch = hipPitch;
      }
      state.wasReaching = reaching;
      const swingWindowSeconds = this.params.swingSpan / (Math.PI * 2 * this.params.cycleHz);
      if (righting) {
        state.mode = 'hold';
      } else if (!frame.moving) {
        state.mode = 'hold';
      } else if (state.mode === 'hold') {
        state.mode = this.inSwingWindow(prefix) ? 'swing' : 'stance';
        state.modeSeconds = 0;
        state.anchorHipPitch = hipPitch;
      } else if (state.mode === 'stance') {
        state.airborneSeconds = footContact ? 0 : state.airborneSeconds + seconds;
        if (this.inSwingWindow(prefix)) {
          if (this.oppositePairGrounded(frame, prefix) && state.modeSeconds >= this.params.minStanceSeconds) {
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
        if (footContact
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

      const turn = this.smoothTurn;
      const strideScale = frame.intent.skill === 'turn' ? sideSign * turn : 1 + sideSign * turn * 0.35;
      const approachGentle = frame.intent.skill === 'interact' ? 0.55 : 1;
      const speedMatchedRate = Math.max(0.18, Math.min(1.05,
        Math.max(0, this.measuredSpeed) / 0.72 + 0.05)) * approachGentle;
      const postureHip = (end === 'front' ? -frame.pitch : frame.pitch) * 0.15 + sideSign * frame.roll * 0.18;
      const rollTarget = (state.mode === 'hold' ? 1.2 * frame.roll : 0)
        + (reaching ? frame.targetSide * sideSign * 0.2 : 0) - turn * 0.12;
      const yawTarget = -turn * (end === 'front' ? 0.45 : -0.3) - yawRate * 0.25
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
      } else if (reaching) {
        // Near-contact forelimb behaviour is shared with the v0.3 body: brace or lift
        // toward the anonymous return instead of stepping. Hind legs keep walking.
        const lifting = !footContact && kneeAngle < 0.35;
        const bracing = !lifting;
        const reachBias = frame.targetSide * sideSign * 0.18;
        const hipTarget = (bracing ? 1.1 + Math.max(0, 0.45 - frame.targetDistance) * 0.12 + reachBias : 0.28)
          + postureHip;
        const kneeTarget = bracing ? 0.9 + Math.max(0, 0.45 - frame.targetDistance) * 0.08 : 0.62;
        jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint', hipTarget, 0.8, 0, 0.6);
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget, 1.4, 2, 0.6);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget, 1.4, 4, 0.6);
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint', kneeTarget, 0.8, 0, 0.6);
      } else if (state.mode === 'hold') {
        jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint', postureHip, 3.5);
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget, 2.5, 2);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget, 2.5, 4);
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint', 0, 3.5);
      } else if (state.mode === 'stance') {
        state.sweepPosition += speedMatchedRate * strideScale * seconds;
        const hipTarget = Math.max(this.params.stanceHipMin,
          Math.min(this.params.stanceHipMax,
            state.anchorHipPitch + state.sweepPosition)) + postureHip;
        const hipState = frame.joints.get(prefix + '-hip-joint');
        if (hipState && Number.isFinite(hipState[1])) {
          // Torque-limited velocity servo: follow the retraction sweep without
          // demanding more ground force than the pad can carry, so the paw sticks.
          const desiredRate = speedMatchedRate * strideScale;
          state.filteredHipRate += (hipState[1] - state.filteredHipRate) * 0.15;
          const rawEffort = Math.max(-0.45, Math.min(0.45, 0.7 * (hipTarget - hipState[0])
            + 0.3 * (desiredRate - state.filteredHipRate)));
          // Slew-limit the effort so impacts cannot spike entity-wide power into
          // the shared energy brownout that stutters every leg at once.
          state.lastHipEffort += Math.max(-0.08, Math.min(0.08, rawEffort - state.lastHipEffort));
          signals.push(createControlSignal(prefix + '-hip', clamp(state.lastHipEffort)));
        }
        // Strong roll damping keeps the planted sole flat; rocking between its
        // long edges is what carries the pad along with the torso.
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget, 2.8, 2, 1.1);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget, 2.5, 4, 0.4);
        // The hip sweep arcs the paw upward at its ends; stance knee extension
        // follows the measured arc so the sole stays loaded instead of rocking
        // on toe and heel corners.
        const arcCompensation = 0.55 * (1 - Math.cos(hipPitch)) + 0.3;
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint',
          state.anchorKneePitch - arcCompensation, 2.0, 0, 0.3);
      } else if (state.mode === 'swing') {
        const progress = Math.min(1, state.modeSeconds / swingWindowSeconds);
        const touchdown = this.params.touchdownPitch[end] - sideSign * turn * 0.12;
        const lift = Math.min(1, progress / 0.28);
        const extend = Math.min(1, Math.max(0, (progress - 0.62) / 0.32));
        const flexed = -0.12 + (this.params.swingKneeFlex + 0.12) * lift;
        const kneeTarget = flexed * (1 - extend) + -0.05 * extend;
        // Late swing reverses from protraction to retraction so the pad lands
        // with near-zero ground speed instead of skidding at body speed.
        const pullback = speedMatchedRate * 0.2
          * Math.min(1, Math.max(0, (progress - 0.85) / 0.15));
        const hipTarget = state.anchorHipPitch
          + (touchdown - state.anchorHipPitch) * progress + pullback;
        jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint', hipTarget,
          this.params.swingHipGain, 0, this.params.swingVelocityGain);
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget, 2.0, 2, this.params.swingVelocityGain);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget, 2.0, 4, this.params.swingVelocityGain);
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint', kneeTarget,
          this.params.swingKneeGain, 0, this.params.swingVelocityGain);
      } else {
        // Seek: a stance leg lost ground or a swing overran its window. Reach the
        // paw down and forward until real contact returns.
        jointCommand(signals, frame, prefix + '-hip', prefix + '-hip-joint',
          this.params.touchdownPitch[end] - 0.05 + postureHip, 3.6, 0, 0.4);
        jointCommand(signals, frame, prefix + '-hip-roll', prefix + '-hip-joint', rollTarget, 2.5, 2, 0.4);
        jointCommand(signals, frame, prefix + '-hip-yaw', prefix + '-hip-joint', yawTarget, 2.5, 4, 0.4);
        jointCommand(signals, frame, prefix + '-knee', prefix + '-knee-joint',
          state.anchorKneePitch, 2.6, 0, 0.4);
      }

      if (frame.joints.has(prefix + '-paw')) {
        const ankleState = frame.joints.get(prefix + '-paw');
        const ankleAngle = ankleState?.[0] ?? 0;
        const ankleVelocity = ankleState?.[1] ?? 0;
        if (state.mode === 'swing' || state.mode === 'seek') {
          signals.push(createControlSignal(prefix + '-ankle',
            clamp(0.15 + sideSign * this.smoothTurn * 0.08)));
        } else {
          // Flatten the paw under load so the pad plants on its sole, not an edge.
          signals.push(createControlSignal(prefix + '-ankle',
            clamp(1.2 * (0 - ankleAngle) - 0.2 * ankleVelocity)));
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
  private readonly brain = new BrainRuntime(new EngagementDecisionPolicy(), 4);
  private readonly motor: TractionGait | PhaseSineGait;
  private readonly traction: TractionGait;
  private snapshot: LeopardAgentSnapshot = {
    goal: '等待感知', skill: 'stand', stability: 'unknown', perceptionTick: -1, decisionCount: 0,
  };
  private lastDecisionKey = '';
  private readonly decisionHistory: LeopardDecisionRecord[] = [];

  constructor(gait: LeopardGaitKind = 'traction', tuning: TractionTuning = {}) {
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
    return this.motor.update(buildFrame(brain), seconds);
  }

  inspect(): LeopardAgentSnapshot { return { ...this.snapshot }; }

  /** Per-leg locomotion states; empty for the phase-sine baseline, which has none. */
  inspectGaitStates(): readonly LeopardLegGaitSnapshot[] {
    return this.motor === this.traction ? this.traction.inspect() : [];
  }

  inspectDecisionHistory(): readonly LeopardDecisionRecord[] { return this.decisionHistory.map((entry) => ({ ...entry })); }
}
