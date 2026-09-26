import type { StructuralActuator } from './actuation';

/** Stable identity is supplied by the caller; the core never invents semantic identities. */
export type EntityId = string;

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quaternion extends Vector3 {
  readonly w: number;
}

export interface Pose {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export interface Material {
  readonly id: string;
  readonly density: number;
  readonly friction: number;
  readonly restitution: number;
  /** Optional impulse at which persistent structural degradation begins (N·s). */
  readonly yieldImpulseNs?: number;
  /** Optional cumulative impulse tolerance before the material fractures (N·s). */
  readonly toughnessImpulseNs?: number;
  /** Sustained-force yield/ultimate thresholds. Omitted capacities are unbounded. */
  readonly yieldForceN?: number;
  readonly ultimateForceN?: number;
  /** Sustained-torque yield/ultimate thresholds. Omitted capacities are unbounded. */
  readonly yieldTorqueNm?: number;
  readonly ultimateTorqueNm?: number;
}

export type Geometry =
  | { readonly kind: 'box'; readonly halfExtents: Vector3 }
  | { readonly kind: 'sphere'; readonly radius: number }
  | { readonly kind: 'capsule'; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: 'convex'; readonly points: readonly Vector3[] };

export interface Part {
  readonly id: string;
  readonly materialId: string;
  readonly geometry: Geometry;
  /** Blueprint-local pose. The physics adapter places the part from this pose. */
  readonly pose: Pose;
  /** Optional positive override. Otherwise mass is derived from material density and geometry volume. */
  readonly mass?: number;
}

export interface SensorNoise {
  /** Standard deviation in the sensor's measurement units. */
  readonly standardDeviation: number;
}

export interface SensorBase {
  readonly id: string;
  /** Part carrying this sensor. Structural separation can make it unreachable. */
  readonly partId: string;
  /** Pose relative to the mounting Part. */
  readonly localPose: Pose;
  /** Forward direction in the sensor frame. */
  readonly forward: Vector3;
  readonly updatePeriodTicks: number;
  readonly noise: SensorNoise;
  readonly latencyTicks: number;
}

export interface ContactSensor extends SensorBase {
  readonly kind: 'contact';
  readonly range: number;
  readonly resolution: number;
}

export interface ProprioceptionSensor extends SensorBase {
  readonly kind: 'proprioception';
  readonly resolution: number;
}

export interface RangeSensor extends SensorBase {
  readonly kind: 'range';
  readonly range: number;
  /** Horizontal field of view in radians. */
  readonly fieldOfViewRadians: number;
  /** Number of angular samples across the field of view. */
  readonly resolution: number;
}

export type Sensor = ContactSensor | ProprioceptionSensor | RangeSensor;

export interface ConnectionBase {
  readonly id: string;
  readonly fromPartId: string;
  readonly toPartId: string;
  /** Optional impulse capacity of this structural connection (N·s). */
  readonly strengthImpulseNs?: number;
  /** Optional sustained-load thresholds; omitted capacities are unbounded. */
  readonly yieldForceN?: number;
  readonly ultimateForceN?: number;
  readonly yieldTorqueNm?: number;
  readonly ultimateTorqueNm?: number;
  /** Anchor expressed in the local frame of the corresponding part. */
  readonly fromAnchor: Vector3;
  /** Anchor expressed in the local frame of the corresponding part. */
  readonly toAnchor: Vector3;
}

/**
 * A backend-neutral passive angular support element. The axis is expressed in
 * the from-Part's local frame and the rest angle is measured relative to the
 * Blueprint's initial relative orientation.
 */
export interface PassiveAngular {
  readonly axis: Vector3;
  readonly restAngle: number;
  readonly stiffnessNmPerRad: number;
  readonly dampingNmsPerRad: number;
  readonly maxTorqueNm?: number;
}

/**
 * A unilateral angular stop about an axis in the from-Part's local frame.
 * Angles use the same Blueprint-relative coordinate as joint sensing and
 * actuation. Unlike passive compliance, the stop applies no torque inside
 * its range. Finite stiffness and torque make this a hard-ish physical stop.
 */
export interface AngularLimit {
  readonly axis: Vector3;
  readonly min: number;
  readonly max: number;
  readonly stiffnessNmPerRad: number;
  readonly dampingNmsPerRad: number;
  readonly maxTorqueNm: number;
}

export interface RigidConnection extends ConnectionBase {
  readonly kind: 'rigid';
  readonly axis?: never;
  readonly limits?: never;
  readonly passiveAngular?: never;
  readonly angularLimits?: never;
}

export interface JointLimits {
  readonly min: number;
  readonly max: number;
}

export interface RevoluteConnection extends ConnectionBase {
  readonly kind: 'revolute';
  /** Axis expressed in the local frame of each connected part. */
  readonly axis: Vector3;
  readonly limits?: JointLimits;
  readonly passiveAngular?: readonly PassiveAngular[];
  readonly angularLimits?: never;
}

export interface SphericalConnection extends ConnectionBase {
  readonly kind: 'spherical';
  /** Three relative rotational degrees of freedom around coincident anchors. */
  readonly axis?: never;
  readonly limits?: never;
  readonly passiveAngular?: readonly PassiveAngular[];
  readonly angularLimits?: readonly AngularLimit[];
}

export interface PrismaticConnection extends ConnectionBase {
  readonly kind: 'prismatic';
  /** Axis expressed in the local frame of each connected part. */
  readonly axis: Vector3;
  readonly limits?: JointLimits;
  readonly passiveAngular?: never;
  readonly angularLimits?: never;
}

export type Connection = RigidConnection | RevoluteConnection | SphericalConnection | PrismaticConnection;

export interface Blueprint {
  readonly id: string;
  readonly materials: readonly Material[];
  readonly parts: readonly Part[];
  readonly connections: readonly Connection[];
  /** Optional actuator declarations; omitted for passive structures. */
  readonly actuators?: readonly StructuralActuator[];
  /** Optional sensors mounted on Parts. */
  readonly sensors?: readonly Sensor[];
}

export interface Entity {
  readonly id: EntityId;
  readonly blueprint: Blueprint;
}

/** World facts only. Intent and labels such as attacks do not belong in this type. */
export interface WorldEvent {
  readonly tick: number;
  readonly kind: 'contact' | 'structural' | 'transfer' | 'significant-state-change';
  readonly partIds: readonly string[];
  readonly causedBy?: number;
}

const VECTOR_EPSILON_SQUARED = 1e-12;
const UNIT_QUATERNION_TOLERANCE = 1e-5;

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isUnitQuaternion(value: Quaternion): boolean {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z) || !Number.isFinite(value.w)) return false;
  const lengthSquared = value.x ** 2 + value.y ** 2 + value.z ** 2 + value.w ** 2;
  return Math.abs(lengthSquared - 1) <= UNIT_QUATERNION_TOLERANCE;
}

function rotate(vector: Vector3, rotation: Quaternion): Vector3 {
  const cross = {
    x: rotation.y * vector.z - rotation.z * vector.y,
    y: rotation.z * vector.x - rotation.x * vector.z,
    z: rotation.x * vector.y - rotation.y * vector.x,
  };
  const doubled = { x: 2 * cross.x, y: 2 * cross.y, z: 2 * cross.z };
  return {
    x: vector.x + rotation.w * doubled.x + rotation.y * doubled.z - rotation.z * doubled.y,
    y: vector.y + rotation.w * doubled.y + rotation.z * doubled.x - rotation.x * doubled.z,
    z: vector.z + rotation.w * doubled.z + rotation.x * doubled.y - rotation.y * doubled.x,
  };
}

function squaredDistance(a: Vector3, b: Vector3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

function hasNonCoplanarPoints(points: readonly Vector3[]): boolean {
  let baseA: Vector3 | undefined;
  let baseB: Vector3 | undefined;
  let baseC: Vector3 | undefined;
  let normal: Vector3 | undefined;

  for (let i = 0; i < points.length && !normal; i += 1) {
    for (let j = i + 1; j < points.length && !normal; j += 1) {
      for (let k = j + 1; k < points.length; k += 1) {
        const a = points[i];
        const b = points[j];
        const c = points[k];
        const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
        const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
        const cross = {
          x: ab.y * ac.z - ab.z * ac.y,
          y: ab.z * ac.x - ab.x * ac.z,
          z: ab.x * ac.y - ab.y * ac.x,
        };
        if (cross.x ** 2 + cross.y ** 2 + cross.z ** 2 > VECTOR_EPSILON_SQUARED) {
          baseA = a;
          baseB = b;
          baseC = c;
          normal = cross;
          break;
        }
      }
    }
  }

  if (!baseA || !baseB || !baseC || !normal) return false;
  for (const point of points) {
    if (point === baseA || point === baseB || point === baseC) continue;
    const offset = { x: point.x - baseA.x, y: point.y - baseA.y, z: point.z - baseA.z };
    if (Math.abs(normal.x * offset.x + normal.y * offset.y + normal.z * offset.z) > VECTOR_EPSILON_SQUARED) return true;
  }
  return false;
}

function validateGeometry(geometry: Geometry, partId: string): string | undefined {
  switch (geometry.kind) {
    case 'box':
      if (!isFiniteVector(geometry.halfExtents) || Object.values(geometry.halfExtents).some((value) => value <= 0)) return `Invalid geometry: ${partId}`;
      return undefined;
    case 'sphere':
      if (!Number.isFinite(geometry.radius) || geometry.radius <= 0) return `Invalid geometry: ${partId}`;
      return undefined;
    case 'capsule':
      if (!Number.isFinite(geometry.radius) || geometry.radius <= 0 || !Number.isFinite(geometry.halfHeight) || geometry.halfHeight <= 0) return `Invalid geometry: ${partId}`;
      return undefined;
    case 'convex':
      if (geometry.points.length < 4 || !geometry.points.every(isFiniteVector) || !hasNonCoplanarPoints(geometry.points)) return `Invalid geometry: ${partId}`;
      return undefined;
    default:
      return `Invalid geometry: ${partId}`;
  }
}

export function validateBlueprint(blueprint: Blueprint): string[] {
  const errors: string[] = [];
  if (!blueprint.id.trim()) errors.push('Blueprint id is required');

  const materialIds = new Set<string>();
  for (const material of blueprint.materials) {
    if (!material.id.trim() || materialIds.has(material.id)) errors.push(`Invalid or duplicate material id: ${material.id}`);
    materialIds.add(material.id);
    if (!Number.isFinite(material.density) || material.density <= 0) errors.push(`Invalid density: ${material.id}`);
    if (!Number.isFinite(material.friction) || material.friction < 0) errors.push(`Invalid friction: ${material.id}`);
    if (!Number.isFinite(material.restitution) || material.restitution < 0 || material.restitution > 1) errors.push(`Invalid restitution: ${material.id}`);
    if (material.yieldImpulseNs !== undefined && (!Number.isFinite(material.yieldImpulseNs) || material.yieldImpulseNs <= 0)) {
      errors.push(`Invalid yieldImpulseNs: ${material.id}`);
    }
    if (material.toughnessImpulseNs !== undefined && (!Number.isFinite(material.toughnessImpulseNs) || material.toughnessImpulseNs <= 0)) {
      errors.push(`Invalid toughnessImpulseNs: ${material.id}`);
    }
    for (const field of ['yieldForceN', 'ultimateForceN', 'yieldTorqueNm', 'ultimateTorqueNm'] as const) {
      const value = material[field];
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) errors.push(`Invalid ${field}: ${material.id}`);
    }
    if (material.yieldForceN !== undefined && material.ultimateForceN !== undefined && material.yieldForceN >= material.ultimateForceN) errors.push(`Invalid force thresholds: ${material.id}`);
    if (material.yieldTorqueNm !== undefined && material.ultimateTorqueNm !== undefined && material.yieldTorqueNm >= material.ultimateTorqueNm) errors.push(`Invalid torque thresholds: ${material.id}`);
  }

  const partIds = new Set<string>();
  const parts = new Map<string, Part>();
  for (const part of blueprint.parts) {
    if (!part.id.trim() || partIds.has(part.id)) errors.push(`Invalid or duplicate part id: ${part.id}`);
    partIds.add(part.id);
    parts.set(part.id, part);
    if (!materialIds.has(part.materialId)) errors.push(`Unknown material: ${part.materialId}`);
    const geometryError = validateGeometry(part.geometry, part.id);
    if (geometryError) errors.push(geometryError);
    if (!isFiniteVector(part.pose.position) || !isUnitQuaternion(part.pose.rotation)) errors.push(`Invalid pose: ${part.id}`);
    if (part.mass !== undefined && (!Number.isFinite(part.mass) || part.mass <= 0)) errors.push(`Invalid mass: ${part.id}`);
  }

  const connectionIds = new Set<string>();
  for (const connection of blueprint.connections) {
    if (!connection.id.trim() || connectionIds.has(connection.id)) errors.push(`Invalid or duplicate connection id: ${connection.id}`);
    connectionIds.add(connection.id);
    if (connection.strengthImpulseNs !== undefined
      && (!Number.isFinite(connection.strengthImpulseNs) || connection.strengthImpulseNs <= 0)) {
      errors.push(`Invalid strengthImpulseNs: ${connection.id}`);
    }
    for (const field of ['yieldForceN', 'ultimateForceN', 'yieldTorqueNm', 'ultimateTorqueNm'] as const) {
      const value = connection[field];
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) errors.push(`Invalid ${field}: ${connection.id}`);
    }
    if (connection.yieldForceN !== undefined && connection.ultimateForceN !== undefined && connection.yieldForceN >= connection.ultimateForceN) errors.push(`Invalid force thresholds: ${connection.id}`);
    if (connection.yieldTorqueNm !== undefined && connection.ultimateTorqueNm !== undefined && connection.yieldTorqueNm >= connection.ultimateTorqueNm) errors.push(`Invalid torque thresholds: ${connection.id}`);
    if (connection.yieldForceN !== undefined || connection.ultimateForceN !== undefined
      || connection.yieldTorqueNm !== undefined || connection.ultimateTorqueNm !== undefined) {
      const fromMaterial = blueprint.materials.find((material) => material.id === parts.get(connection.fromPartId)?.materialId);
      const toMaterial = blueprint.materials.find((material) => material.id === parts.get(connection.toPartId)?.materialId);
      if (fromMaterial && toMaterial) {
        for (const [channel, yieldField, ultimateField] of [
          ['force', 'yieldForceN', 'ultimateForceN'], ['torque', 'yieldTorqueNm', 'ultimateTorqueNm'],
        ] as const) {
          if (connection[yieldField] === undefined && connection[ultimateField] === undefined) continue;
          const yieldValue = connection[yieldField] ?? Math.min(fromMaterial[yieldField] ?? Infinity, toMaterial[yieldField] ?? Infinity);
          const ultimateValue = connection[ultimateField] ?? Math.min(fromMaterial[ultimateField] ?? Infinity, toMaterial[ultimateField] ?? Infinity);
          if (Number.isFinite(yieldValue) && Number.isFinite(ultimateValue) && yieldValue >= ultimateValue
            && !(connection[yieldField] !== undefined && connection[ultimateField] !== undefined)) {
            errors.push(`Invalid effective ${channel} thresholds: ${connection.id}`);
          }
        }
      }
    }
    if (!partIds.has(connection.fromPartId) || !partIds.has(connection.toPartId)) errors.push(`Unknown connection endpoint: ${connection.id}`);
    if (connection.fromPartId === connection.toPartId) errors.push(`Self connection: ${connection.id}`);
    if (!isFiniteVector(connection.fromAnchor) || !isFiniteVector(connection.toAnchor)) errors.push(`Invalid connection anchors: ${connection.id}`);
    else {
      const from = parts.get(connection.fromPartId);
      const to = parts.get(connection.toPartId);
      if (from && to && isFiniteVector(from.pose.position) && isFiniteVector(to.pose.position)
        && isUnitQuaternion(from.pose.rotation) && isUnitQuaternion(to.pose.rotation)) {
        const a = rotate(connection.fromAnchor, from.pose.rotation);
        const b = rotate(connection.toAnchor, to.pose.rotation);
        if (squaredDistance(
          { x: a.x + from.pose.position.x, y: a.y + from.pose.position.y, z: a.z + from.pose.position.z },
          { x: b.x + to.pose.position.x, y: b.y + to.pose.position.y, z: b.z + to.pose.position.z },
        ) > 1e-8) errors.push(`Misaligned connection anchors: ${connection.id}`);
      }
    }

    // Keep the public type a discriminated union, while still reporting malformed runtime data cast from external input.
    const runtimeOptions = connection as unknown as {
      readonly kind: string;
      readonly axis?: Vector3;
      readonly limits?: JointLimits;
      readonly passiveAngular?: readonly PassiveAngular[];
      readonly angularLimits?: readonly AngularLimit[];
    };
    if (runtimeOptions.kind === 'rigid') {
      if (runtimeOptions.axis !== undefined || runtimeOptions.limits !== undefined || runtimeOptions.passiveAngular !== undefined || runtimeOptions.angularLimits !== undefined) {
        errors.push(`Invalid rigid connection options: ${connection.id}`);
      }
      continue;
    }

    if (runtimeOptions.kind !== 'revolute' && runtimeOptions.kind !== 'spherical' && runtimeOptions.kind !== 'prismatic') {
      errors.push(`Invalid connection kind: ${connection.id}`);
      continue;
    }

    if (runtimeOptions.kind !== 'revolute' && runtimeOptions.kind !== 'spherical' && runtimeOptions.passiveAngular !== undefined) {
      errors.push(`Invalid passiveAngular: ${connection.id}`);
    }

    if (runtimeOptions.angularLimits !== undefined) {
      if (runtimeOptions.kind !== 'spherical' || !Array.isArray(runtimeOptions.angularLimits)
        || runtimeOptions.angularLimits.length === 0) {
        errors.push(`Invalid angularLimits: ${connection.id}`);
      } else {
        const priorAxes: Vector3[] = [];
        for (const limit of runtimeOptions.angularLimits) {
          if (!limit || typeof limit !== 'object') {
            errors.push(`Invalid angularLimits entry: ${connection.id}`);
            continue;
          }
          if (!limit.axis || !isFiniteVector(limit.axis)
            || limit.axis.x ** 2 + limit.axis.y ** 2 + limit.axis.z ** 2 <= VECTOR_EPSILON_SQUARED) {
            errors.push(`Invalid angularLimits axis: ${connection.id}`);
          } else {
            const magnitude = Math.hypot(limit.axis.x, limit.axis.y, limit.axis.z);
            const axis = { x: limit.axis.x / magnitude, y: limit.axis.y / magnitude, z: limit.axis.z / magnitude };
            if (priorAxes.some((prior) => Math.abs(prior.x * axis.x + prior.y * axis.y + prior.z * axis.z) > 0.999)) {
              errors.push(`Duplicate angularLimits axis: ${connection.id}`);
            }
            priorAxes.push(axis);
          }
          if (!Number.isFinite(limit.min) || !Number.isFinite(limit.max)
            || limit.min >= limit.max || limit.min <= -Math.PI || limit.max >= Math.PI
            || limit.min > 0 || limit.max < 0) {
            errors.push(`Invalid angularLimits range: ${connection.id}`);
          }
          if (!Number.isFinite(limit.stiffnessNmPerRad) || limit.stiffnessNmPerRad <= 0) {
            errors.push(`Invalid angularLimits stiffness: ${connection.id}`);
          }
          if (!Number.isFinite(limit.dampingNmsPerRad) || limit.dampingNmsPerRad < 0) {
            errors.push(`Invalid angularLimits damping: ${connection.id}`);
          }
          if (!Number.isFinite(limit.maxTorqueNm) || limit.maxTorqueNm <= 0) {
            errors.push(`Invalid angularLimits maxTorqueNm: ${connection.id}`);
          }
        }
      }
    }

    if (runtimeOptions.passiveAngular !== undefined) {
      if (!Array.isArray(runtimeOptions.passiveAngular)) {
        errors.push(`Invalid passiveAngular: ${connection.id}`);
      } else {
        for (const support of runtimeOptions.passiveAngular) {
          if (!support || typeof support !== 'object') {
            errors.push(`Invalid passiveAngular entry: ${connection.id}`);
            continue;
          }
          const supportAxis = support.axis;
          if (!supportAxis || !isFiniteVector(supportAxis)
            || supportAxis.x ** 2 + supportAxis.y ** 2 + supportAxis.z ** 2 <= VECTOR_EPSILON_SQUARED) {
            errors.push(`Invalid passiveAngular axis: ${connection.id}`);
          } else if (runtimeOptions.kind === 'revolute' && runtimeOptions.axis && isFiniteVector(runtimeOptions.axis)
            && runtimeOptions.axis.x ** 2 + runtimeOptions.axis.y ** 2 + runtimeOptions.axis.z ** 2 > VECTOR_EPSILON_SQUARED) {
            const supportLength = Math.hypot(supportAxis.x, supportAxis.y, supportAxis.z);
            const declaredLength = Math.hypot(runtimeOptions.axis.x, runtimeOptions.axis.y, runtimeOptions.axis.z);
            const cross = {
              x: supportAxis.y * runtimeOptions.axis.z - supportAxis.z * runtimeOptions.axis.y,
              y: supportAxis.z * runtimeOptions.axis.x - supportAxis.x * runtimeOptions.axis.z,
              z: supportAxis.x * runtimeOptions.axis.y - supportAxis.y * runtimeOptions.axis.x,
            };
            if ((cross.x ** 2 + cross.y ** 2 + cross.z ** 2) / (supportLength * declaredLength) ** 2 > 1e-8) {
              errors.push(`Invalid passiveAngular axis: ${connection.id}`);
            }
          }
          if (!Number.isFinite(support.restAngle)) errors.push(`Invalid passiveAngular restAngle: ${connection.id}`);
          if (!Number.isFinite(support.stiffnessNmPerRad) || support.stiffnessNmPerRad <= 0) {
            errors.push(`Invalid passiveAngular stiffness: ${connection.id}`);
          }
          if (!Number.isFinite(support.dampingNmsPerRad) || support.dampingNmsPerRad < 0) {
            errors.push(`Invalid passiveAngular damping: ${connection.id}`);
          }
          if (support.maxTorqueNm !== undefined
            && (!Number.isFinite(support.maxTorqueNm) || support.maxTorqueNm <= 0)) {
            errors.push(`Invalid passiveAngular maxTorqueNm: ${connection.id}`);
          }
        }
      }
    }

    const axis = runtimeOptions.axis;
    if (runtimeOptions.kind !== 'spherical') {
      if (!axis || !isFiniteVector(axis) || axis.x ** 2 + axis.y ** 2 + axis.z ** 2 <= VECTOR_EPSILON_SQUARED) {
        errors.push(`Invalid connection axis: ${connection.id}`);
      } else {
        const from = parts.get(connection.fromPartId);
        const to = parts.get(connection.toPartId);
        if (from && to && isUnitQuaternion(from.pose.rotation) && isUnitQuaternion(to.pose.rotation)) {
          const a = rotate(axis, from.pose.rotation);
          const b = rotate(axis, to.pose.rotation);
          const lengthSquared = axis.x ** 2 + axis.y ** 2 + axis.z ** 2;
          if (squaredDistance(a, b) / lengthSquared > 1e-8) errors.push(`Misaligned connection axis: ${connection.id}`);
        }
      }
    }
    const limits = runtimeOptions.limits;
    if (limits !== undefined && (!Number.isFinite(limits.min) || !Number.isFinite(limits.max) || limits.min > limits.max)) {
      errors.push(`Invalid connection limits: ${connection.id}`);
    }
    if (runtimeOptions.kind === 'spherical' && limits !== undefined) errors.push(`Invalid spherical connection options: ${connection.id}`);
    if (runtimeOptions.kind === 'spherical' && axis !== undefined) errors.push(`Invalid spherical connection options: ${connection.id}`);
  }

  const actuatorIds = new Set<string>();
  const connections = new Map(blueprint.connections.map((connection) => [connection.id, connection]));
  for (const actuator of blueprint.actuators ?? []) {
    if (!actuator.id.trim() || actuatorIds.has(actuator.id)) errors.push(`Invalid or duplicate actuator id: ${actuator.id}`);
    actuatorIds.add(actuator.id);
    if (!Number.isFinite(actuator.maxOutput) || actuator.maxOutput <= 0) errors.push(`Invalid actuator maxOutput: ${actuator.id}`);
    if (actuator.responseTimeSeconds !== undefined
      && (!Number.isFinite(actuator.responseTimeSeconds) || actuator.responseTimeSeconds <= 0)) {
      errors.push(`Invalid actuator responseTimeSeconds: ${actuator.id}`);
    }
    if (actuator.kind === 'tension') {
      if (!partIds.has(actuator.fromPartId) || !partIds.has(actuator.toPartId)) {
        errors.push(`Unknown tension actuator endpoint: ${actuator.id}`);
      }
      if (actuator.fromPartId === actuator.toPartId) errors.push(`Self tension actuator: ${actuator.id}`);
      if (!actuator.fromAttachment || !actuator.toAttachment
        || !isFiniteVector(actuator.fromAttachment) || !isFiniteVector(actuator.toAttachment)) {
        errors.push(`Invalid tension actuator attachment: ${actuator.id}`);
      }
    } else if (actuator.kind === undefined || actuator.kind === 'joint') {
      const connection = connections.get(actuator.connectionId);
      if (!connection) errors.push(`Unknown actuator connection: ${actuator.id}`);
      else if (connection.kind !== 'revolute' && connection.kind !== 'spherical' && connection.kind !== 'prismatic') {
        errors.push(`Actuator requires a movable connection: ${actuator.id}`);
      }
      const actuatorAxis = (actuator as unknown as { readonly axis?: Vector3 }).axis;
      if (actuatorAxis !== undefined
        && (!actuatorAxis || !isFiniteVector(actuatorAxis)
          || actuatorAxis.x ** 2 + actuatorAxis.y ** 2 + actuatorAxis.z ** 2 <= VECTOR_EPSILON_SQUARED)) {
        errors.push(`Invalid actuator axis: ${actuator.id}`);
      }
      if (connection?.kind === 'spherical' && (!actuatorAxis || !isFiniteVector(actuatorAxis)
        || actuatorAxis.x ** 2 + actuatorAxis.y ** 2 + actuatorAxis.z ** 2 <= VECTOR_EPSILON_SQUARED)) {
        errors.push(`Spherical actuator requires a nonzero axis: ${actuator.id}`);
      }
      if (connection && connection.kind !== 'spherical' && actuatorAxis !== undefined) {
        errors.push(`Actuator axis requires a spherical connection: ${actuator.id}`);
      }
    } else {
      errors.push(`Invalid actuator kind: ${actuator.id}`);
    }
  }

  const sensorIds = new Set<string>();
  for (const sensor of blueprint.sensors ?? []) {
    const sensorId = sensor.id;
    if (!sensor.id.trim() || sensorIds.has(sensor.id)) errors.push(`Invalid or duplicate sensor id: ${sensor.id}`);
    sensorIds.add(sensor.id);
    if (!partIds.has(sensor.partId)) errors.push(`Unknown sensor part: ${sensor.id}`);
    if (!isFiniteVector(sensor.localPose.position) || !isUnitQuaternion(sensor.localPose.rotation)) {
      errors.push(`Invalid sensor pose: ${sensor.id}`);
    }
    if (!isFiniteVector(sensor.forward)
      || sensor.forward.x ** 2 + sensor.forward.y ** 2 + sensor.forward.z ** 2 <= VECTOR_EPSILON_SQUARED) {
      errors.push(`Invalid sensor forward: ${sensor.id}`);
    }
    if (!Number.isInteger(sensor.updatePeriodTicks) || sensor.updatePeriodTicks <= 0) {
      errors.push(`Invalid sensor updatePeriodTicks: ${sensor.id}`);
    }
    if (!Number.isFinite(sensor.noise.standardDeviation) || sensor.noise.standardDeviation < 0) {
      errors.push(`Invalid sensor noise: ${sensor.id}`);
    }
    if (!Number.isInteger(sensor.latencyTicks) || sensor.latencyTicks < 0) {
      errors.push(`Invalid sensor latencyTicks: ${sensor.id}`);
    }

    switch (sensor.kind) {
      case 'contact':
        if (!Number.isFinite(sensor.range) || sensor.range <= 0) errors.push(`Invalid sensor range: ${sensor.id}`);
        if (!Number.isInteger(sensor.resolution) || sensor.resolution <= 0) errors.push(`Invalid sensor resolution: ${sensor.id}`);
        break;
      case 'proprioception':
        if (!Number.isInteger(sensor.resolution) || sensor.resolution <= 0) errors.push(`Invalid sensor resolution: ${sensor.id}`);
        break;
      case 'range':
        if (!Number.isFinite(sensor.range) || sensor.range <= 0) errors.push(`Invalid sensor range: ${sensor.id}`);
        if (!Number.isFinite(sensor.fieldOfViewRadians) || sensor.fieldOfViewRadians <= 0 || sensor.fieldOfViewRadians > Math.PI * 2) {
          errors.push(`Invalid sensor fieldOfViewRadians: ${sensor.id}`);
        }
        if (!Number.isInteger(sensor.resolution) || sensor.resolution <= 0) errors.push(`Invalid sensor resolution: ${sensor.id}`);
        break;
      default:
        errors.push(`Invalid sensor kind: ${sensorId}`);
    }
  }
  return errors;
}
