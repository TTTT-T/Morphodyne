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

export interface ConnectionBase {
  readonly id: string;
  readonly fromPartId: string;
  readonly toPartId: string;
  /** Anchor expressed in the local frame of the corresponding part. */
  readonly fromAnchor: Vector3;
  /** Anchor expressed in the local frame of the corresponding part. */
  readonly toAnchor: Vector3;
}

export interface RigidConnection extends ConnectionBase {
  readonly kind: 'rigid';
  readonly axis?: never;
  readonly limits?: never;
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
}

export interface PrismaticConnection extends ConnectionBase {
  readonly kind: 'prismatic';
  /** Axis expressed in the local frame of each connected part. */
  readonly axis: Vector3;
  readonly limits?: JointLimits;
}

export type Connection = RigidConnection | RevoluteConnection | PrismaticConnection;

export interface Blueprint {
  readonly id: string;
  readonly materials: readonly Material[];
  readonly parts: readonly Part[];
  readonly connections: readonly Connection[];
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
    const runtimeOptions = connection as unknown as { readonly kind: string; readonly axis?: Vector3; readonly limits?: JointLimits };
    if (runtimeOptions.kind === 'rigid') {
      if (runtimeOptions.axis !== undefined || runtimeOptions.limits !== undefined) errors.push(`Invalid rigid connection options: ${connection.id}`);
      continue;
    }

    if (runtimeOptions.kind !== 'revolute' && runtimeOptions.kind !== 'prismatic') {
      errors.push(`Invalid connection kind: ${connection.id}`);
      continue;
    }

    const axis = runtimeOptions.axis;
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
    const limits = runtimeOptions.limits;
    if (limits !== undefined && (!Number.isFinite(limits.min) || !Number.isFinite(limits.max) || limits.min > limits.max)) {
      errors.push(`Invalid connection limits: ${connection.id}`);
    }
  }
  return errors;
}
