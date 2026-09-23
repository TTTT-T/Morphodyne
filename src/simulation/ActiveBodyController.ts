import type { Pose, Quaternion } from '../core/model';
import { createControlSignal, type ControlSignal, type MotorPrimitive } from '../core/actuation';

/** Intent is a request; the controller does not promise a physical outcome. */
export interface ControlIntent {
  readonly forward: number;
  readonly turn: number;
}

/**
 * A caller supplied actuator channel. x/z describe the channel's location in
 * the body frame; they do not assign a semantic role to the connected part.
 * The phase is also supplied by the caller so the same policy can be reused
 * with different structures.
 */
export interface ActuatorChannel {
  readonly actuatorId: string;
  readonly x: number;
  readonly z: number;
  readonly phase: number;
  readonly neutralAngle?: number;
  readonly motionGain?: number;
}

/** Compact input for bodies that describe actuator channels in groups. */
export interface ActuatorGroup {
  readonly actuatorIds: readonly string[];
  readonly x: number;
  readonly z: number;
  readonly phaseOffset?: number;
  readonly phaseOffsets?: readonly number[];
  readonly neutralAngles?: readonly number[];
  readonly motionGain?: number;
}

export interface JointFeedback {
  /** Measured relative joint angle in radians. */
  readonly angle: number;
  /** Optional measured relative angular velocity in radians per second. */
  readonly angularVelocity?: number;
}

export interface ControllerFeedback {
  /** Keys are actuator ids (or the connection ids mapped by the caller). */
  readonly joints?: ReadonlyMap<string, JointFeedback>;
  /** Optional body angular velocity used by the orientation damping term. */
  readonly bodyAngularVelocity?: { readonly x: number; readonly y: number; readonly z: number };
}

/** Rich input used by this controller's posture and phase policy. */
export interface ActiveBodyControllerInput {
  readonly seconds: number;
  readonly rootPose: Pose;
  readonly intent: ControlIntent;
  readonly channels: readonly ActuatorChannel[];
  readonly feedback?: ControllerFeedback;
  readonly phaseRadians: number;
}

export interface ActiveBodyControllerOptions {
  readonly id?: string;
  readonly cycleFrequencyHz?: number;
  readonly standingGain?: number;
  readonly standingDampingGain?: number;
  readonly jointPositionGain?: number;
  readonly jointVelocityGain?: number;
  readonly motionGain?: number;
  readonly turnGain?: number;
}

const DEFAULT_OPTIONS: Required<Omit<ActiveBodyControllerOptions, 'id'>> = {
  cycleFrequencyHz: 1.4,
  standingGain: 0.9,
  standingDampingGain: 0.12,
  jointPositionGain: 0.8,
  jointVelocityGain: 0.08,
  motionGain: 0.7,
  turnGain: 0.55,
};

const TAU = 2 * Math.PI;
const EPSILON = 1e-9;

function clamp(value: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function normalizedQuaternion(rotation: Quaternion): Quaternion {
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (!Number.isFinite(length) || length <= EPSILON) throw new Error('Root pose rotation must be nonzero and finite');
  return {
    x: rotation.x / length,
    y: rotation.y / length,
    z: rotation.z / length,
    w: rotation.w / length,
  };
}

function rotateUp(rotation: Quaternion): { readonly x: number; readonly y: number; readonly z: number } {
  const { x, y, z, w } = normalizedQuaternion(rotation);
  return {
    x: 2 * (x * y - z * w),
    y: 1 - 2 * (x * x + z * z),
    z: 2 * (y * z + x * w),
  };
}

function wrappedPhase(value: number): number {
  const result = value % TAU;
  return result < 0 ? result + TAU : result;
}

function validateChannel(channel: ActuatorChannel, index: number): void {
  if (!channel.actuatorId.trim()) throw new Error(`Actuator channel ${index} requires an id`);
  requireFinite(channel.x, `Actuator channel ${channel.actuatorId} x`);
  requireFinite(channel.z, `Actuator channel ${channel.actuatorId} z`);
  requireFinite(channel.phase, `Actuator channel ${channel.actuatorId} phase`);
  if (channel.neutralAngle !== undefined) requireFinite(channel.neutralAngle, `Actuator channel ${channel.actuatorId} neutral angle`);
  if (channel.motionGain !== undefined && (!Number.isFinite(channel.motionGain) || channel.motionGain < 0)) {
    throw new Error(`Actuator channel ${channel.actuatorId} motion gain must be nonnegative and finite`);
  }
}

function validateChannels(channels: readonly ActuatorChannel[]): void {
  const ids = new Set<string>();
  channels.forEach((channel, index) => {
    validateChannel(channel, index);
    if (ids.has(channel.actuatorId)) throw new Error(`Duplicate actuator channel: ${channel.actuatorId}`);
    ids.add(channel.actuatorId);
  });
  if (channels.length === 0) throw new Error('At least one actuator channel is required');
}

/** Expand caller-owned groups without assigning a function to any part. */
export function expandActuatorGroups(groups: readonly ActuatorGroup[]): readonly ActuatorChannel[] {
  if (groups.length === 0) throw new Error('At least one actuator group is required');
  const channels: ActuatorChannel[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    requireFinite(group.x, `Actuator group ${groupIndex} x`);
    requireFinite(group.z, `Actuator group ${groupIndex} z`);
    if (group.actuatorIds.length === 0) throw new Error(`Actuator group ${groupIndex} requires an id`);
    if (group.phaseOffset !== undefined) requireFinite(group.phaseOffset, `Actuator group ${groupIndex} phase offset`);
    if (group.phaseOffsets && group.phaseOffsets.length !== group.actuatorIds.length) {
      throw new Error(`Actuator group ${groupIndex} phase offsets must match actuator ids`);
    }
    if (group.neutralAngles && group.neutralAngles.length !== group.actuatorIds.length) {
      throw new Error(`Actuator group ${groupIndex} neutral angles must match actuator ids`);
    }
    if (group.motionGain !== undefined && (!Number.isFinite(group.motionGain) || group.motionGain < 0)) {
      throw new Error(`Actuator group ${groupIndex} motion gain must be nonnegative and finite`);
    }

    group.actuatorIds.forEach((actuatorId, index) => {
      const phase = group.phaseOffsets?.[index] ?? group.phaseOffset ?? 0;
      const neutralAngle = group.neutralAngles?.[index];
      requireFinite(phase, `Actuator channel ${actuatorId} phase`);
      if (neutralAngle !== undefined) requireFinite(neutralAngle, `Actuator channel ${actuatorId} neutral angle`);
      channels.push({ actuatorId, x: group.x, z: group.z, phase, neutralAngle, motionGain: group.motionGain });
    });
  }
  validateChannels(channels);
  return channels;
}

/**
 * A small generic controller for an actively assembled body.
 *
 * The standing term is a posture feedback signal. The oscillating terms are
 * only added for the caller's intent, and every returned value is normalized
 * for a downstream actuator. No body pose is written here.
 */
export class ActiveBodyController implements MotorPrimitive<ActiveBodyControllerInput> {
  readonly id: string;
  readonly actuatorIds: readonly string[];
  readonly channels: readonly ActuatorChannel[];

  private readonly options: Required<Omit<ActiveBodyControllerOptions, 'id'>>;
  private phaseRadians = 0;

  constructor(channels: readonly ActuatorChannel[], options: ActiveBodyControllerOptions = {}) {
    validateChannels(channels);
    this.channels = channels.map((channel) => ({ ...channel }));
    this.actuatorIds = this.channels.map(({ actuatorId }) => actuatorId);
    this.id = options.id ?? 'active-body-controller';
    if (!this.id.trim()) throw new Error('Controller id is required');
    this.options = {
      cycleFrequencyHz: options.cycleFrequencyHz ?? DEFAULT_OPTIONS.cycleFrequencyHz,
      standingGain: options.standingGain ?? DEFAULT_OPTIONS.standingGain,
      standingDampingGain: options.standingDampingGain ?? DEFAULT_OPTIONS.standingDampingGain,
      jointPositionGain: options.jointPositionGain ?? DEFAULT_OPTIONS.jointPositionGain,
      jointVelocityGain: options.jointVelocityGain ?? DEFAULT_OPTIONS.jointVelocityGain,
      motionGain: options.motionGain ?? DEFAULT_OPTIONS.motionGain,
      turnGain: options.turnGain ?? DEFAULT_OPTIONS.turnGain,
    };
    if (this.options.cycleFrequencyHz < 0) throw new Error('Cycle frequency must be nonnegative');
    if (Object.values(this.options).some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error('Controller gains must be nonnegative and finite');
    }
  }

  static fromGroups(groups: readonly ActuatorGroup[], options: ActiveBodyControllerOptions = {}): ActiveBodyController {
    return new ActiveBodyController(expandActuatorGroups(groups), options);
  }

  /** Reset the internal gait phase after a restart or deterministic trial. */
  reset(): void {
    this.phaseRadians = 0;
  }

  /** Advance the primitive and emit one control signal per supplied channel. */
  update(
    seconds: number,
    rootPose: Pose,
    intent: ControlIntent,
    feedback?: ControllerFeedback,
  ): readonly ControlSignal[] {
    requireFinite(seconds, 'Controller step');
    if (seconds < 0) throw new Error('Controller step must be nonnegative');
    this.phaseRadians = wrappedPhase(this.phaseRadians + seconds * TAU * this.options.cycleFrequencyHz);
    return this.generateSignals({
      seconds,
      rootPose,
      intent,
      channels: this.channels,
      feedback,
      phaseRadians: this.phaseRadians,
    });
  }

  generateSignals(input: ActiveBodyControllerInput): readonly ControlSignal[] {
    requireFinite(input.seconds, 'Motor primitive step');
    requireFinite(input.phaseRadians, 'Motor primitive phase');
    if (input.seconds < 0) throw new Error('Motor primitive step must be nonnegative');
    const forward = clampIntent(input.intent.forward, 'forward');
    const turn = clampIntent(input.intent.turn, 'turn');
    const up = rotateUp(input.rootPose.rotation);
    const orientationDamping = input.feedback?.bodyAngularVelocity;
    const radius = Math.hypot(...input.channels.map(({ x, z }) => Math.hypot(x, z))) / Math.sqrt(input.channels.length) || 1;
    const feedbackMap = input.feedback?.joints;

    return input.channels.map((channel) => {
      const radialLength = Math.hypot(channel.x, channel.z) || 1;
      const radialX = channel.x / radialLength;
      const radialZ = channel.z / radialLength;
      const bodyScale = Math.max(radius, radialLength, 1e-6);

      // This term is closed-loop: body orientation and measured joint state
      // describe the error; the actuator only receives the resulting signal.
      const tiltError = (-up.x * radialX - up.z * radialZ) * (radialLength / bodyScale);
      const tiltRate = orientationDamping
        ? -(orientationDamping.x * radialX + orientationDamping.z * radialZ)
        : 0;
      const phase = input.phaseRadians + channel.phase;
      const cycle = Math.sin(phase);
      const crossCycle = Math.cos(phase);
      const channelGain = channel.motionGain ?? 1;
      const localDrive = forward + turn * this.options.turnGain * radialX;
      const forwardTarget = -localDrive * this.options.motionGain * channelGain
        * (0.65 * cycle + 0.35 * radialZ * crossCycle);
      const targetAngle = (channel.neutralAngle ?? 0) + forwardTarget;
      const joint = feedbackMap?.get(channel.actuatorId);
      const jointError = joint ? targetAngle - joint.angle : targetAngle;
      const jointRate = joint?.angularVelocity ? -joint.angularVelocity : 0;
      const standingSignal = this.options.standingGain * tiltError
        + this.options.standingDampingGain * tiltRate
        + this.options.jointPositionGain * jointError
        + this.options.jointVelocityGain * jointRate;
      return createControlSignal(channel.actuatorId, clamp(standingSignal));
    });
  }
}

function clampIntent(value: number, label: string): number {
  requireFinite(value, `Intent ${label}`);
  return clamp(value);
}
