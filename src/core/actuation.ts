import type { Vector3 } from './model';

/**
 * A normalized command addressed to one actuator.
 *
 * A control signal is an input to an actuator. It does not describe an
 * action or guarantee a physical outcome.
 */
export interface ControlSignal {
  readonly actuatorId: string;
  readonly value: number;
}

/** Backend-independent actuator description. Output units belong to the concrete actuator. */
export interface Actuator {
  readonly id: string;
  /** Maximum magnitude of the actuator output in its implementation's units. */
  readonly maxOutput: number;
  /** Optional first-order response time in seconds. */
  readonly responseTimeSeconds?: number;
}

/**
 * An actuator whose output is applied through a revolute or prismatic
 * Connection. Revolute output is torque (N·m); prismatic output is force (N).
 */
export interface JointActuator extends Actuator {
  /** Omitted for compatibility with existing Joint Actuator Blueprints. */
  readonly kind?: 'joint';
  readonly connectionId: string;
  /** Optional axis in the connected joint's from-Part local frame. Required for spherical joints. */
  readonly axis?: Vector3;
}

/** Equal and opposite tensile forces between two Part-local points. */
export interface TensionActuator extends Actuator {
  readonly kind: 'tension';
  readonly fromPartId: string;
  readonly toPartId: string;
  /** Metres in the corresponding Part's local frame. maxOutput is newtons. */
  readonly fromAttachment: Vector3;
  readonly toAttachment: Vector3;
}

export type StructuralActuator = JointActuator | TensionActuator;

/** A finite store supplying mechanical work to an Entity's actuators. */
export interface EnergySourceSpec {
  /** Store capacity in joules. The store starts full unless initialEnergyJ is set. */
  readonly capacityJ: number;
  readonly initialEnergyJ?: number;
  /** Maximum usable mechanical power in watts, shared by all actuators. */
  readonly maxPowerWatts: number;
  /** Fraction of stored energy converted to positive mechanical work. */
  readonly efficiency: number;
}

export function validateEnergySourceSpec(spec: EnergySourceSpec): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(spec.capacityJ) || spec.capacityJ < 0) errors.push('Energy capacity must be finite and nonnegative');
  if (spec.initialEnergyJ !== undefined && (!Number.isFinite(spec.initialEnergyJ)
    || spec.initialEnergyJ < 0 || spec.initialEnergyJ > spec.capacityJ)) {
    errors.push('Initial energy must be finite and within capacity');
  }
  if (!Number.isFinite(spec.maxPowerWatts) || spec.maxPowerWatts < 0) {
    errors.push('Maximum power must be finite and nonnegative');
  }
  if (!Number.isFinite(spec.efficiency) || spec.efficiency <= 0 || spec.efficiency > 1) {
    errors.push('Energy efficiency must be finite and in (0, 1]');
  }
  return errors;
}

/**
 * A reusable body-control mapping. It produces actuator signals only; physics
 * decides whether those signals produce the intended result.
 */
export interface MotorPrimitive<Input = number> {
  readonly id: string;
  readonly actuatorIds: readonly string[];
  /** Input and every emitted signal value are normalized to [-1, 1]. */
  readonly generateSignals: (input: Input) => readonly ControlSignal[];
}

export function validateControlSignal(signal: ControlSignal): string[] {
  const errors: string[] = [];
  if (!signal.actuatorId.trim()) errors.push('Control signal actuator id is required');
  if (!Number.isFinite(signal.value) || signal.value < -1 || signal.value > 1) {
    errors.push(`Invalid control signal value: ${signal.actuatorId}`);
  }
  return errors;
}

/** Create a normalized signal and reject an invalid control input early. */
export function createControlSignal(actuatorId: string, value: number): ControlSignal {
  const errors = validateControlSignal({ actuatorId, value });
  if (errors.length) throw new Error(errors.join('; '));
  return { actuatorId, value };
}
