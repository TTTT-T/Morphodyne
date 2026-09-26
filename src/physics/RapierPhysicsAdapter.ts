import RAPIER from '@dimforge/rapier3d-compat';
import type { Connection, Entity, Material, Part, PassiveAngular, Pose, Quaternion, Vector3 } from '../core/model';
import { validateBlueprint } from '../core/model';
import type {
  BodyHandle,
  BoxSpec,
  PhysicalContact,
  PartContactLoad,
  ConnectionLoad,
  PhysicsAdapter,
  RayHit,
  ReconstructBodyOptions,
} from './PhysicsAdapter';
import type { PhysicsBody } from './PhysicsBody';

interface RuntimeConnection {
  readonly fromPartId: string;
  readonly toPartId: string;
  readonly kind: Connection['kind'];
  readonly axis?: Vector3;
  readonly passiveAngular?: readonly PassiveAngular[];
  readonly from: RAPIER.RigidBody;
  readonly to: RAPIER.RigidBody;
  readonly fromAnchor: Vector3;
  readonly toAnchor: Vector3;
  readonly initialPosition?: number;
  readonly initialRelativeRotation?: Quaternion;
  jointHandle?: number;
  broken: boolean;
  actuatorOutput?: number;
  passiveTorqueWorld?: Vector3;
}

interface RuntimePhysicsBody {
  readonly entityId: string;
  readonly partHandles: Map<string, BodyHandle>;
  readonly connections: Map<string, RuntimeConnection>;
  readonly connectionHandles: Map<string, number>;
  readonly latestPartImpulses: Map<string, number>;
  readonly latestPartAppliedImpulses: Map<string, number>;
  readonly latestPartContactLoads: Map<string, PartContactLoad>;
  readonly pendingPartImpulses: Map<string, number>;
  readonly latestContacts: Map<string, PhysicalContact[]>;
  readonly latestConnectionLoads: Map<string, ConnectionLoad>;
  readonly partColliders: Map<string, RAPIER.Collider>;
}

interface MomentumSnapshot {
  readonly linearVelocity: Vector3;
  readonly angularVelocity: Vector3;
  readonly position: Vector3;
  readonly mass: number;
  readonly inertia: readonly [number, number, number, number, number, number];
}

interface AppliedWrench { force: Vector3; torque: Vector3 }

function add(a: Vector3, b: Vector3): Vector3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(v: Vector3, n: number): Vector3 { return { x: v.x * n, y: v.y * n, z: v.z * n }; }
function cross(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function magnitude(v: Vector3): number { return Math.hypot(v.x, v.y, v.z); }

function momentumSnapshot(body: RAPIER.RigidBody): MomentumSnapshot {
  const inverse = body.effectiveWorldInvInertia();
  // Rapier's matrix uses a shared scratch buffer. Copy every scalar before
  // another Rapier getter overwrites that buffer.
  const inertia: MomentumSnapshot['inertia'] = [inverse.m11, inverse.m12, inverse.m13, inverse.m22, inverse.m23, inverse.m33];
  const position = body.translation();
  const linearVelocity = body.linvel();
  const angularVelocity = body.angvel();
  return {
    position: { x: position.x, y: position.y, z: position.z },
    linearVelocity: { x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z },
    angularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
    mass: body.mass(),
    inertia,
  };
}

function angularMomentum(state: MomentumSnapshot): Vector3 {
  const [a, b, c, d, e, f] = state.inertia;
  const determinant = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-15) return { x: 0, y: 0, z: 0 };
  // Invert Rapier's symmetric world inverse-inertia tensor, then multiply by angular velocity.
  const i11 = (d * f - e * e) / determinant;
  const i12 = (c * e - b * f) / determinant;
  const i13 = (b * e - c * d) / determinant;
  const i22 = (a * f - c * c) / determinant;
  const i23 = (b * c - a * e) / determinant;
  const i33 = (a * d - b * b) / determinant;
  const w = state.angularVelocity;
  return { x: i11 * w.x + i12 * w.y + i13 * w.z, y: i12 * w.x + i22 * w.y + i23 * w.z, z: i13 * w.x + i23 * w.y + i33 * w.z };
}

interface PartRuntimeReference {
  readonly runtimeBody: RuntimePhysicsBody;
  readonly partId: string;
}

interface PartRuntimeState {
  readonly pose: Pose;
  readonly linearVelocity: Vector3;
  readonly angularVelocity: Vector3;
}

function colliderFor(part: Part, material: Material): RAPIER.ColliderDesc {
  let descriptor: RAPIER.ColliderDesc | null;
  switch (part.geometry.kind) {
    case 'box': {
      const { x, y, z } = part.geometry.halfExtents;
      descriptor = RAPIER.ColliderDesc.cuboid(x, y, z);
      break;
    }
    case 'sphere':
      descriptor = RAPIER.ColliderDesc.ball(part.geometry.radius);
      break;
    case 'capsule':
      descriptor = RAPIER.ColliderDesc.capsule(part.geometry.halfHeight, part.geometry.radius);
      break;
    case 'convex':
      descriptor = RAPIER.ColliderDesc.convexHull(new Float32Array(part.geometry.points.flatMap(({ x, y, z }) => [x, y, z])));
      if (!descriptor) throw new Error(`Invalid convex hull: ${part.id}`);
      break;
  }
  descriptor.setFriction(material.friction).setRestitution(material.restitution);
  descriptor.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(0);
  if (part.mass === undefined) descriptor.setDensity(material.density);
  else descriptor.setMass(part.mass);
  return descriptor;
}

function relativeRotation(from: Quaternion, to: Quaternion): Quaternion {
  // The second joint frame must preserve the Blueprint's initial relative pose.
  const a = { x: -to.x, y: -to.y, z: -to.z, w: to.w };
  return {
    x: a.w * from.x + a.x * from.w + a.y * from.z - a.z * from.y,
    y: a.w * from.y - a.x * from.z + a.y * from.w + a.z * from.x,
    z: a.w * from.z + a.x * from.y - a.y * from.x + a.z * from.w,
    w: a.w * from.w - a.x * from.x - a.y * from.y - a.z * from.z,
  };
}

function unitVector(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
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

function worldPoint(body: RAPIER.RigidBody, localPoint: Vector3): Vector3 {
  const position = body.translation();
  const rotated = rotate(localPoint, body.rotation());
  return {
    x: position.x + rotated.x,
    y: position.y + rotated.y,
    z: position.z + rotated.z,
  };
}

function poseWorldPoint(pose: { readonly position: Vector3; readonly rotation: Quaternion }, localPoint: Vector3): Vector3 {
  const rotated = rotate(localPoint, pose.rotation);
  return {
    x: pose.position.x + rotated.x,
    y: pose.position.y + rotated.y,
    z: pose.position.z + rotated.z,
  };
}

function negate(vector: Vector3): Vector3 {
  return { x: -vector.x, y: -vector.y, z: -vector.z };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function quaternionConjugate(quaternion: Quaternion): Quaternion {
  return { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w };
}

function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function normalizedQuaternion(quaternion: Quaternion): Quaternion {
  const magnitude = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  return {
    x: quaternion.x / magnitude,
    y: quaternion.y / magnitude,
    z: quaternion.z / magnitude,
    w: quaternion.w / magnitude,
  };
}

function relativeOrientation(from: Quaternion, to: Quaternion): Quaternion {
  return quaternionMultiply(quaternionConjugate(from), to);
}

function shortestSignedAngle(relative: Quaternion, axis: Vector3): number {
  const normalized = normalizedQuaternion(relative);
  const signedHalfSine = dot(normalized, axis);
  let angle = 2 * Math.atan2(signedHalfSine, normalized.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

const DEFAULT_SPHERICAL_AXIS: Vector3 = { x: 0, y: 0, z: 1 };

function checkedUnitVector(axis: Vector3, label: string): Vector3 {
  if (![axis.x, axis.y, axis.z].every(Number.isFinite) || Math.hypot(axis.x, axis.y, axis.z) <= 1e-6) {
    throw new Error(`Invalid ${label} axis`);
  }
  return unitVector(axis);
}

function jointAxis(connection: RuntimeConnection, requestedAxis?: Vector3): Vector3 {
  if (connection.kind === 'spherical') {
    const axis = requestedAxis ?? DEFAULT_SPHERICAL_AXIS;
    return checkedUnitVector(axis, 'spherical joint');
  }
  if (!connection.axis) throw new Error('Missing joint axis');
  return connection.axis;
}

function relativeJointAngle(connection: RuntimeConnection, axis: Vector3): number {
  const initialRelativeRotation = connection.initialRelativeRotation;
  if (!initialRelativeRotation) throw new Error('Missing initial rotation for spherical/revolute connection');
  const currentRelativeRotation = relativeOrientation(connection.from.rotation(), connection.to.rotation());
  // The support axes live in the from-Part frame. A relative rotation about
  // such an axis pre-multiplies the initial relative orientation, so compare
  // current and initial with current * inverse(initial).
  const delta = quaternionMultiply(currentRelativeRotation, quaternionConjugate(initialRelativeRotation));
  return shortestSignedAngle(delta, axis);
}

function inverseInertiaAlong(body: RAPIER.RigidBody, axis: Vector3): number {
  const matrix = body.effectiveWorldInvInertia();
  // Read the shared Rapier scratch matrix before querying another body.
  const projected = {
    x: matrix.m11 * axis.x + matrix.m12 * axis.y + matrix.m13 * axis.z,
    y: matrix.m12 * axis.x + matrix.m22 * axis.y + matrix.m23 * axis.z,
    z: matrix.m13 * axis.x + matrix.m23 * axis.y + matrix.m33 * axis.z,
  };
  return dot(axis, projected);
}

function jointFor(connection: Connection, fromPart: Part, toPart: Part): RAPIER.JointData {
  const { fromAnchor, toAnchor } = connection;
  if (connection.kind === 'rigid') {
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    return RAPIER.JointData.fixed(fromAnchor, identity, toAnchor,
      relativeRotation(fromPart.pose.rotation, toPart.pose.rotation));
  }
  if (connection.kind === 'spherical') return RAPIER.JointData.spherical(fromAnchor, toAnchor);
  const { axis } = connection;
  const magnitude = Math.hypot(axis.x, axis.y, axis.z);
  const unitAxis = { x: axis.x / magnitude, y: axis.y / magnitude, z: axis.z / magnitude };
  const descriptor = connection.kind === 'revolute'
    ? RAPIER.JointData.revolute(fromAnchor, toAnchor, unitAxis)
    : RAPIER.JointData.prismatic(fromAnchor, toAnchor, unitAxis);
  if (connection.limits) {
    descriptor.limitsEnabled = true;
    descriptor.limits = [connection.limits.min, connection.limits.max];
  }
  return descriptor;
}

export class RapierPhysicsAdapter implements PhysicsAdapter {
  private readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private readonly eventQueue = new RAPIER.EventQueue(true);
  private readonly bodies = new Map<BodyHandle, RAPIER.RigidBody>();
  private readonly runtimeBodies = new WeakMap<PhysicsBody, RuntimePhysicsBody>();
  private readonly activeRuntimeBodies = new Set<RuntimePhysicsBody>();
  private readonly partRuntimeReferences = new Map<BodyHandle, PartRuntimeReference>();
  private readonly colliderRuntimeReferences = new Map<number, PartRuntimeReference>();
  private readonly stepScopedForceBodies = new Set<RAPIER.RigidBody>();
  private readonly appliedWrenches = new Map<RAPIER.RigidBody, AppliedWrench>();
  private readonly staticWorldBoxHandles = new Set<BodyHandle>();
  private nextHandle = 1;

  static async create(): Promise<RapierPhysicsAdapter> {
    await RAPIER.init();
    return new RapierPhysicsAdapter();
  }

  createBox(spec: BoxSpec): BodyHandle {
    const { x, y, z } = spec.halfExtents;
    if (![x, y, z].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Box half extents must be positive and finite');
    if (!Object.values(spec.position).every(Number.isFinite)) throw new Error('Box position must be finite');
    const rotation = spec.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
    if (![rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) throw new Error('Box rotation must be finite');
    const rotationMagnitude = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
    if (rotationMagnitude === 0) throw new Error('Box rotation must be non-zero');
    if (spec.friction !== undefined && (!Number.isFinite(spec.friction) || spec.friction < 0)) {
      throw new Error('Box friction must be non-negative and finite');
    }
    const descriptor = spec.dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
    descriptor.setTranslation(spec.position.x, spec.position.y, spec.position.z)
      .setRotation({
        x: rotation.x / rotationMagnitude,
        y: rotation.y / rotationMagnitude,
        z: rotation.z / rotationMagnitude,
        w: rotation.w / rotationMagnitude,
      });
    const body = this.world.createRigidBody(descriptor);
    const collider = RAPIER.ColliderDesc.cuboid(x, y, z);
    if (spec.friction !== undefined) collider.setFriction(spec.friction);
    collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(0);
    this.world.createCollider(collider, body);
    const handle = this.nextHandle++;
    this.bodies.set(handle, body);
    if (!spec.dynamic) this.staticWorldBoxHandles.add(handle);
    return handle;
  }

  createBody(entity: Entity, origin: Vector3 = { x: 0, y: 0, z: 0 }): PhysicsBody {
    return this.createBodyInternal(entity, origin);
  }

  reconstructBody(
    oldBody: PhysicsBody,
    revisedEntity: Entity,
    options: ReconstructBodyOptions = {},
  ): PhysicsBody {
    const oldRuntimeBody = this.runtimeBodies.get(oldBody);
    if (!oldRuntimeBody) throw new Error('Unknown physics body');

    const preservedPartStates = new Map<string, PartRuntimeState>();
    for (const part of revisedEntity.blueprint.parts) {
      const handle = oldRuntimeBody.partHandles.get(part.id);
      const runtimePart = handle === undefined ? undefined : this.bodies.get(handle);
      if (handle === undefined || !runtimePart) continue;
      const pose = this.readPose(handle);
      const linearVelocity = runtimePart.linvel();
      const angularVelocity = runtimePart.angvel();
      preservedPartStates.set(part.id, {
        pose,
        linearVelocity: { x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z },
        angularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
      });
    }

    // Build and validate the replacement while the old body remains intact.
    // If creation fails, createBodyInternal removes any partially created
    // Rapier objects and the caller can continue using oldBody.
    const replacement = this.createBodyInternal(
      revisedEntity,
      options.origin ?? { x: 0, y: 0, z: 0 },
      preservedPartStates,
      options.activeConnectionIds,
    );
    try {
      this.removeBody(oldBody);
    } catch (error) {
      // Do not leave two live representations if old-body teardown fails.
      this.removeBody(replacement);
      throw error;
    }
    return replacement;
  }

  private createBodyInternal(
    entity: Entity,
    origin: Vector3,
    preservedPartStates?: ReadonlyMap<string, PartRuntimeState>,
    activeConnectionIds?: readonly string[],
  ): PhysicsBody {
    const errors = validateBlueprint(entity.blueprint);
    if (!entity.id.trim()) errors.push('Entity id is required');
    if (![origin.x, origin.y, origin.z].every(Number.isFinite)) errors.push('Origin must be finite');
    if (errors.length) throw new Error(`Invalid Blueprint: ${errors.join('; ')}`);

    const materials = new Map(entity.blueprint.materials.map((material) => [material.id, material]));
    const parts = new Map(entity.blueprint.parts.map((part) => [part.id, part]));
    const activeConnections = activeConnectionIds === undefined
      ? entity.blueprint.connections
      : entity.blueprint.connections.filter((connection) => activeConnectionIds.includes(connection.id));
    if (activeConnectionIds !== undefined) {
      const connectionIds = new Set(entity.blueprint.connections.map((connection) => connection.id));
      for (const connectionId of activeConnectionIds) {
        if (!connectionIds.has(connectionId)) errors.push(`Unknown active connection id: ${connectionId}`);
      }
      if (errors.length) throw new Error(`Invalid Blueprint: ${errors.join('; ')}`);
    }
    // Prepare every collider before touching the world; Rapier may reject a degenerate hull.
    const colliders = new Map(entity.blueprint.parts.map((part) => [
      part.id, colliderFor(part, materials.get(part.materialId)!),
    ]));
    const joints = new Map(activeConnections.map((connection) => [
      connection.id, jointFor(connection, parts.get(connection.fromPartId)!, parts.get(connection.toPartId)!),
    ]));
    const partHandles = new Map<string, BodyHandle>();
    const connectionHandles = new Map<string, number>();
    const partColliders = new Map<string, RAPIER.Collider>();
    const createdBodies: RAPIER.RigidBody[] = [];
    const createdJointHandles: number[] = [];
    try {
      for (const part of entity.blueprint.parts) {
        const state = preservedPartStates?.get(part.id);
        const position = state?.pose.position ?? {
          x: part.pose.position.x + origin.x,
          y: part.pose.position.y + origin.y,
          z: part.pose.position.z + origin.z,
        };
        const rotation = state?.pose.rotation ?? part.pose.rotation;
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z)
          .setRotation(rotation));
        createdBodies.push(body);
        const collider = this.world.createCollider(colliders.get(part.id)!, body);
        if (state) {
          body.setLinvel(state.linearVelocity, true);
          body.setAngvel(state.angularVelocity, true);
        }
        const handle = this.nextHandle++;
        this.bodies.set(handle, body);
        partHandles.set(part.id, handle);
        partColliders.set(part.id, collider);
      }
      for (const connection of activeConnections) {
        const from = this.bodies.get(partHandles.get(connection.fromPartId)!)!;
        const to = this.bodies.get(partHandles.get(connection.toPartId)!)!;
        const joint = this.world.createImpulseJoint(joints.get(connection.id)!, from, to, true);
        joint.setContactsEnabled(false);
        createdJointHandles.push(joint.handle);
        connectionHandles.set(connection.id, joint.handle);
      }
    } catch (error) {
      for (const jointHandle of createdJointHandles) {
        if (this.world.impulseJoints.contains(jointHandle)) this.world.impulseJoints.remove(jointHandle, true);
      }
      for (const body of createdBodies) {
        if (body.isValid()) this.world.removeRigidBody(body);
      }
      for (const handle of partHandles.values()) this.bodies.delete(handle);
      throw error;
    }
    const runtimeConnections = new Map<string, RuntimeConnection>();
    for (const connection of activeConnections) {
      const fromPart = parts.get(connection.fromPartId)!;
      const toPart = parts.get(connection.toPartId)!;
      const axis = connection.kind === 'rigid' || connection.kind === 'spherical' ? undefined : unitVector(connection.axis);
      const initialAxis = axis ? unitVector(rotate(axis, fromPart.pose.rotation)) : undefined;
      const initialFromAnchor = poseWorldPoint(fromPart.pose, connection.fromAnchor);
      const initialToAnchor = poseWorldPoint(toPart.pose, connection.toAnchor);
      const initialAnchorOffset = {
        x: initialToAnchor.x - initialFromAnchor.x,
        y: initialToAnchor.y - initialFromAnchor.y,
        z: initialToAnchor.z - initialFromAnchor.z,
      };
      runtimeConnections.set(connection.id, {
        fromPartId: connection.fromPartId,
        toPartId: connection.toPartId,
        kind: connection.kind,
        ...(axis ? {
          axis,
          initialPosition: dot(initialAnchorOffset, initialAxis!),
        } : {}),
        ...(connection.kind === 'revolute' || connection.kind === 'spherical' ? {
          initialRelativeRotation: relativeOrientation(fromPart.pose.rotation, toPart.pose.rotation),
        } : {}),
        from: this.bodies.get(partHandles.get(connection.fromPartId)!)!,
        to: this.bodies.get(partHandles.get(connection.toPartId)!)!,
        fromAnchor: connection.fromAnchor,
        toAnchor: connection.toAnchor,
        ...(connection.passiveAngular ? {
          passiveAngular: connection.passiveAngular.map((entry) => ({
            ...entry,
            axis: unitVector(entry.axis),
          })),
        } : {}),
        jointHandle: connectionHandles.get(connection.id)!,
        broken: false,
      });
    }
    const runtimeBody: RuntimePhysicsBody = {
      entityId: entity.id,
      partHandles,
      connections: runtimeConnections,
      connectionHandles,
      latestPartImpulses: new Map(entity.blueprint.parts.map((part) => [part.id, 0])),
      latestPartAppliedImpulses: new Map(entity.blueprint.parts.map((part) => [part.id, 0])),
      pendingPartImpulses: new Map(),
      latestContacts: new Map(entity.blueprint.parts.map((part) => [part.id, []])),
      latestPartContactLoads: new Map(entity.blueprint.parts.map((part) => [part.id, { impulseNs: 0, forceN: 0 }])),
      latestConnectionLoads: new Map(activeConnections.map((connection) => [connection.id, { forceN: 0, torqueNm: 0 }])),
      partColliders,
    };
    const physicsBody: PhysicsBody = {
      entityId: entity.id,
      partHandles,
      connectionHandles,
      readPartPose: (partId: string) => {
        const handle = partHandles.get(partId);
        if (handle === undefined) throw new Error(`Unknown part id: ${partId}`);
        return this.readPose(handle);
      },
    };
    this.runtimeBodies.set(physicsBody, runtimeBody);
    this.activeRuntimeBodies.add(runtimeBody);
    for (const part of entity.blueprint.parts) {
      const reference = { runtimeBody, partId: part.id };
      this.partRuntimeReferences.set(partHandles.get(part.id)!, reference);
      this.colliderRuntimeReferences.set(partColliders.get(part.id)!.handle, reference);
    }
    return physicsBody;
  }

  private recordWrench(body: RAPIER.RigidBody, force: Vector3, torque: Vector3): void {
    const current = this.appliedWrenches.get(body) ?? { force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 } };
    current.force = add(current.force, force);
    current.torque = add(current.torque, torque);
    this.appliedWrenches.set(body, current);
  }

  removeBody(body: PhysicsBody): void {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    this.removeParts(body, [...runtimeBody.partHandles.keys()]);
  }

  removeParts(body: PhysicsBody, partIds: readonly string[]): void {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');

    const requestedPartIds = new Set(partIds);
    const removedBodies = new Set<RAPIER.RigidBody>();
    const removedHandles = new Map<string, BodyHandle>();
    for (const partId of requestedPartIds) {
      const handle = runtimeBody.partHandles.get(partId);
      const part = handle === undefined ? undefined : this.bodies.get(handle);
      if (handle === undefined || !part) throw new Error(`Unknown part id: ${partId}`);
      removedHandles.set(partId, handle);
      removedBodies.add(part);
    }
    if (requestedPartIds.size === 0) return;

    // Remove every connection touching the selected Parts first. This also
    // handles connections that were already broken and no longer have a live
    // Rapier joint handle.
    for (const [connectionId, connection] of runtimeBody.connections) {
      if (!removedBodies.has(connection.from) && !removedBodies.has(connection.to)) continue;
      if (connection.jointHandle !== undefined && this.world.impulseJoints.contains(connection.jointHandle)) {
        this.world.impulseJoints.remove(connection.jointHandle, true);
      }
      connection.jointHandle = undefined;
      connection.broken = true;
      runtimeBody.connectionHandles.delete(connectionId);
      runtimeBody.connections.delete(connectionId);
      runtimeBody.latestConnectionLoads.delete(connectionId);
    }

    for (const [partId, handle] of removedHandles) {
      const part = this.bodies.get(handle)!;
      const collider = runtimeBody.partColliders.get(partId);
      if (collider) this.colliderRuntimeReferences.delete(collider.handle);
      this.partRuntimeReferences.delete(handle);
      this.stepScopedForceBodies.delete(part);
      this.appliedWrenches.delete(part);
      runtimeBody.partColliders.delete(partId);
      runtimeBody.latestPartImpulses.delete(partId);
      runtimeBody.pendingPartImpulses.delete(partId);
      const contacts = runtimeBody.latestContacts.get(partId);
      if (contacts) contacts.length = 0;
      runtimeBody.latestContacts.delete(partId);
      runtimeBody.latestPartContactLoads.delete(partId);
      runtimeBody.latestPartAppliedImpulses.delete(partId);
      runtimeBody.partHandles.delete(partId);
      if (part.isValid()) this.world.removeRigidBody(part);
      this.bodies.delete(handle);
    }

    if (runtimeBody.partHandles.size > 0) return;

    runtimeBody.connections.clear();
    runtimeBody.connectionHandles.clear();
    runtimeBody.partColliders.clear();
    runtimeBody.latestPartImpulses.clear();
    runtimeBody.pendingPartImpulses.clear();
    runtimeBody.latestContacts.clear();
    runtimeBody.latestPartContactLoads.clear();
    runtimeBody.latestPartAppliedImpulses.clear();
    this.activeRuntimeBodies.delete(runtimeBody);
    this.runtimeBodies.delete(body);
  }

  applyImpulse(handle: BodyHandle, impulse: Vector3): void {
    if (![impulse.x, impulse.y, impulse.z].every(Number.isFinite)) throw new Error('Impulse must be finite');
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    body.applyImpulse(impulse, true);
    const reference = this.partRuntimeReferences.get(handle);
    if (reference) {
      const magnitude = Math.hypot(impulse.x, impulse.y, impulse.z);
      reference.runtimeBody.pendingPartImpulses.set(
        reference.partId,
        (reference.runtimeBody.pendingPartImpulses.get(reference.partId) ?? 0) + magnitude,
      );
    }
  }

  applyForce(handle: BodyHandle, force: Vector3): void {
    if (![force.x, force.y, force.z].every(Number.isFinite)) throw new Error('Force must be finite');
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    body.addForce(force, true);
    this.recordWrench(body, force, { x: 0, y: 0, z: 0 });
    this.stepScopedForceBodies.add(body);
  }

  applyForceAtPoint(handle: BodyHandle, force: Vector3, point: Vector3): void {
    if (![force.x, force.y, force.z, point.x, point.y, point.z].every(Number.isFinite)) {
      throw new Error('Point force and position must be finite');
    }
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    body.addForceAtPoint(force, point, true);
    const center = body.worldCom();
    const arm = { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
    this.recordWrench(body, force, cross(arm, force));
    this.stepScopedForceBodies.add(body);
  }

  readWorldPoint(handle: BodyHandle, localPoint: Vector3): Vector3 {
    if (![localPoint.x, localPoint.y, localPoint.z].every(Number.isFinite)) throw new Error('Local point must be finite');
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    return worldPoint(body, localPoint);
  }

  readPointVelocity(handle: BodyHandle, localPoint: Vector3): Vector3 {
    const point = this.readWorldPoint(handle, localPoint);
    const body = this.bodies.get(handle)!;
    const velocity = body.velocityAtPoint(point);
    return { x: velocity.x, y: velocity.y, z: velocity.z };
  }

  setBoxFriction(handle: BodyHandle, friction: number): void {
    if (!Number.isFinite(friction) || friction < 0) throw new Error('Box friction must be non-negative and finite');
    if (!this.staticWorldBoxHandles.has(handle)) throw new Error(`Unknown static world box handle: ${handle}`);
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown static world box handle: ${handle}`);
    body.collider(0).setFriction(friction);
  }

  applyTorqueImpulse(handle: BodyHandle, torque: Vector3): void {
    if (![torque.x, torque.y, torque.z].every(Number.isFinite)) throw new Error('Torque impulse must be finite');
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    body.applyTorqueImpulse(torque, true);
  }

  readPartImpactImpulse(body: PhysicsBody, partId: string): number {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    if (!runtimeBody.latestPartImpulses.has(partId)) throw new Error(`Unknown part id: ${partId}`);
    return runtimeBody.latestPartImpulses.get(partId)!;
  }

  readPartAppliedImpulse(body: PhysicsBody, partId: string): number {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const impulse = runtimeBody.latestPartAppliedImpulses.get(partId);
    if (impulse === undefined) throw new Error(`Unknown part id: ${partId}`);
    return impulse;
  }

  readPartContacts(body: PhysicsBody, partId: string): readonly PhysicalContact[] {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const contacts = runtimeBody.latestContacts.get(partId);
    if (!contacts) throw new Error(`Unknown part id: ${partId}`);
    return contacts;
  }

  readPartContactLoad(body: PhysicsBody, partId: string): PartContactLoad {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const load = runtimeBody.latestPartContactLoads.get(partId);
    if (!load) throw new Error(`Unknown part id: ${partId}`);
    return load;
  }

  readConnectionLoad(body: PhysicsBody, connectionId: string): ConnectionLoad {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.broken) return { forceN: 0, torqueNm: 0 };
    return runtimeBody.latestConnectionLoads.get(connectionId) ?? { forceN: 0, torqueNm: 0 };
  }

  readPartAngularVelocity(body: PhysicsBody, partId: string): Vector3 {
    const handle = body.partHandles.get(partId);
    if (handle === undefined || !this.runtimeBodies.has(body)) throw new Error(`Unknown part id: ${partId}`);
    const velocity = this.bodies.get(handle)!.angvel();
    return { x: velocity.x, y: velocity.y, z: velocity.z };
  }

  castSensorRay(origin: Vector3, direction: Vector3, range: number, excludePartHandle: BodyHandle): RayHit | null {
    if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, range].every(Number.isFinite)
      || range <= 0 || Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) > 1e-5) {
      throw new Error('Invalid sensor ray');
    }
    const excluded = this.bodies.get(excludePartHandle);
    if (!excluded || !this.partRuntimeReferences.has(excludePartHandle)) throw new Error('Unknown mounting Part handle');
    const owner = this.partRuntimeReferences.get(excludePartHandle)!.runtimeBody;
    const hit = this.world.castRay(new RAPIER.Ray(origin, direction), range, true,
      undefined, undefined, undefined, excluded,
      (collider) => this.colliderRuntimeReferences.get(collider.handle)?.runtimeBody !== owner);
    if (!hit) return null;
    return {
      distance: hit.timeOfImpact,
      point: {
        x: origin.x + direction.x * hit.timeOfImpact,
        y: origin.y + direction.y * hit.timeOfImpact,
        z: origin.z + direction.z * hit.timeOfImpact,
      },
    };
  }

  breakConnection(body: PhysicsBody, connectionId: string): void {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.broken) return;
    if (connection.jointHandle !== undefined && this.world.impulseJoints.contains(connection.jointHandle)) {
      this.world.impulseJoints.remove(connection.jointHandle, true);
    }
    connection.jointHandle = undefined;
    connection.broken = true;
    runtimeBody.connectionHandles.delete(connectionId);
  }

  applyJointOutput(body: PhysicsBody, connectionId: string, output: number, requestedAxis?: Vector3): void {
    if (!Number.isFinite(output)) throw new Error('Joint output must be finite');
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.broken) return;
    if (connection.kind === 'rigid') {
      throw new Error(`Cannot actuate rigid connection: ${connectionId}`);
    }

    // The Blueprint axis is local to the first body. Rapier determines the
    // current body pose; rotating it here keeps output aligned after motion.
    const axis = rotate(jointAxis(connection, requestedAxis), connection.from.rotation());
    const effort = { x: axis.x * output, y: axis.y * output, z: axis.z * output };
    if (connection.kind === 'prismatic') {
      const fromForce = negate(effort);
      const toForce = effort;
      const fromPoint = worldPoint(connection.from, connection.fromAnchor);
      const toPoint = worldPoint(connection.to, connection.toAnchor);
      connection.from.addForceAtPoint(fromForce, fromPoint, true);
      connection.to.addForceAtPoint(toForce, toPoint, true);
      const fromCom = { ...connection.from.worldCom() };
      const toCom = { ...connection.to.worldCom() };
      this.recordWrench(connection.from, fromForce, cross(add(fromPoint, scale(fromCom, -1)), fromForce));
      this.recordWrench(connection.to, toForce, cross(add(toPoint, scale(toCom, -1)), toForce));
    } else {
      connection.from.addTorque(negate(effort), true);
      connection.to.addTorque(effort, true);
      this.recordWrench(connection.from, { x: 0, y: 0, z: 0 }, negate(effort));
      this.recordWrench(connection.to, { x: 0, y: 0, z: 0 }, effort);
    }
    connection.actuatorOutput = output;
    this.stepScopedForceBodies.add(connection.from);
    this.stepScopedForceBodies.add(connection.to);
  }

  readJointVelocity(body: PhysicsBody, connectionId: string, requestedAxis?: Vector3): number {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.broken) return 0;
    if (connection.kind === 'rigid') {
      throw new Error(`Cannot read velocity of rigid connection: ${connectionId}`);
    }

    const localAxis = jointAxis(connection, requestedAxis);
    const axis = rotate(localAxis, connection.from.rotation());
    if (connection.kind === 'revolute' || connection.kind === 'spherical') {
      const fromVelocity = connection.from.angvel();
      const toVelocity = connection.to.angvel();
      return dot({
        x: toVelocity.x - fromVelocity.x,
        y: toVelocity.y - fromVelocity.y,
        z: toVelocity.z - fromVelocity.z,
      }, axis);
    }

    const fromVelocity = connection.from.velocityAtPoint(worldPoint(connection.from, connection.fromAnchor));
    const toVelocity = connection.to.velocityAtPoint(worldPoint(connection.to, connection.toAnchor));
    return dot({
      x: toVelocity.x - fromVelocity.x,
      y: toVelocity.y - fromVelocity.y,
      z: toVelocity.z - fromVelocity.z,
    }, axis);
  }

  readJointPosition(body: PhysicsBody, connectionId: string, requestedAxis?: Vector3): number {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.broken) return 0;
    if (connection.kind === 'rigid') {
      throw new Error(`Cannot read position of rigid connection: ${connectionId}`);
    }

    if (connection.kind === 'prismatic') {
      const axis = rotate(jointAxis(connection), connection.from.rotation());
      const fromAnchor = worldPoint(connection.from, connection.fromAnchor);
      const toAnchor = worldPoint(connection.to, connection.toAnchor);
      const offset = {
        x: toAnchor.x - fromAnchor.x,
        y: toAnchor.y - fromAnchor.y,
        z: toAnchor.z - fromAnchor.z,
      };
      return dot(offset, axis) - (connection.initialPosition ?? 0);
    }

    return relativeJointAngle(connection, jointAxis(connection, requestedAxis));
  }

  private applyPassiveAngular(runtimeBody: RuntimePhysicsBody, seconds: number): void {
    for (const connection of runtimeBody.connections.values()) {
      if (connection.broken || !connection.passiveAngular?.length) continue;
      for (const support of connection.passiveAngular) {
        const localAxis = checkedUnitVector(support.axis, 'passive angular support');
        const angle = relativeJointAngle(connection, localAxis);
        const fromAngularVelocity = connection.from.angvel();
        const toAngularVelocity = connection.to.angvel();
        const relativeVelocity = {
          x: toAngularVelocity.x - fromAngularVelocity.x,
          y: toAngularVelocity.y - fromAngularVelocity.y,
          z: toAngularVelocity.z - fromAngularVelocity.z,
        };
        const worldAxis = rotate(localAxis, connection.from.rotation());
        const velocity = dot(relativeVelocity, worldAxis);
        const springTorque = -support.stiffnessNmPerRad * (angle - support.restAngle);
        let dampingTorque = -support.dampingNmsPerRad * velocity;
        // A very large declared damping coefficient can otherwise reverse the
        // relative angular velocity in one explicit step. Limit only the
        // damping contribution by the pair's physical inverse inertia; this
        // remains an applied torque while keeping passive damping dissipative.
        const inverseInertia = inverseInertiaAlong(connection.from, worldAxis)
          + inverseInertiaAlong(connection.to, worldAxis);
        if (inverseInertia > 0 && Number.isFinite(inverseInertia)) {
          const maxDampingTorque = Math.abs(velocity) / (inverseInertia * seconds);
          dampingTorque = Math.max(-maxDampingTorque, Math.min(maxDampingTorque, dampingTorque));
        }
        let torque = springTorque + dampingTorque;
        if (support.maxTorqueNm !== undefined) {
          torque = Math.max(-support.maxTorqueNm, Math.min(support.maxTorqueNm, torque));
        }
        if (!Number.isFinite(torque) || Math.abs(torque) <= 1e-12) continue;
        const toTorque = scale(worldAxis, torque);
        const fromTorque = negate(toTorque);
        connection.passiveTorqueWorld = add(connection.passiveTorqueWorld ?? { x: 0, y: 0, z: 0 }, toTorque);
        connection.from.addTorque(fromTorque, true);
        connection.to.addTorque(toTorque, true);
        this.recordWrench(connection.from, { x: 0, y: 0, z: 0 }, fromTorque);
        this.recordWrench(connection.to, { x: 0, y: 0, z: 0 }, toTorque);
        this.stepScopedForceBodies.add(connection.from);
        this.stepScopedForceBodies.add(connection.to);
      }
    }
  }

  step(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Physics step must be positive and finite');
    const before = new Map<RAPIER.RigidBody, MomentumSnapshot>();
    for (const runtimeBody of this.activeRuntimeBodies) {
      for (const connection of runtimeBody.connections.values()) {
        before.set(connection.from, momentumSnapshot(connection.from));
        before.set(connection.to, momentumSnapshot(connection.to));
      }
    }
    for (const runtimeBody of this.activeRuntimeBodies) {
      for (const connection of runtimeBody.connections.values()) connection.passiveTorqueWorld = undefined;
      for (const partId of runtimeBody.latestPartImpulses.keys()) runtimeBody.latestPartImpulses.set(partId, 0);
      for (const partId of runtimeBody.latestPartAppliedImpulses.keys()) runtimeBody.latestPartAppliedImpulses.set(partId, 0);
      for (const partId of runtimeBody.latestPartContactLoads.keys()) runtimeBody.latestPartContactLoads.set(partId, { impulseNs: 0, forceN: 0 });
      for (const contacts of runtimeBody.latestContacts.values()) contacts.length = 0;
    }
    this.world.timestep = seconds;
    // Passive supports are ordinary equal-and-opposite torques applied through
    // the connected bodies for this step. They never modify pose or velocity
    // directly and are included in the applied-wrench load estimate below.
    for (const runtimeBody of this.activeRuntimeBodies) this.applyPassiveAngular(runtimeBody, seconds);
    this.world.step(this.eventQueue);
    for (const runtimeBody of this.activeRuntimeBodies) {
      for (const [partId, collider] of runtimeBody.partColliders) {
        const contacts = runtimeBody.latestContacts.get(partId)!;
        this.world.contactPairsWith(collider, (other) => {
          const otherReference = this.colliderRuntimeReferences.get(other.handle);
          this.world.contactPair(collider, other, (manifold) => {
            for (let i = 0; i < manifold.numSolverContacts(); i += 1) {
              const point = manifold.solverContactPoint(i);
              if (!point) continue;
              contacts.push({ point: { x: point.x, y: point.y, z: point.z },
                impulseNs: Math.max(0, manifold.contactImpulse(i)),
                ...(otherReference ? { otherEntityId: otherReference.runtimeBody.entityId,
                  otherPartId: otherReference.partId } : {}) });
            }
          });
        });
      }
    }
    this.eventQueue.drainContactForceEvents((event) => {
      const impulse = event.totalForceMagnitude() * seconds;
      if (!Number.isFinite(impulse) || impulse <= 0) return;
      const references = [
        this.colliderRuntimeReferences.get(event.collider1()),
        this.colliderRuntimeReferences.get(event.collider2()),
      ];
      for (const reference of references) {
        if (!reference) continue;
        const { runtimeBody, partId } = reference;
        const previous = runtimeBody.latestPartContactLoads.get(partId)!;
        runtimeBody.latestPartContactLoads.set(partId, {
          impulseNs: previous.impulseNs + impulse,
          forceN: previous.forceN + event.totalForceMagnitude(),
        });
        runtimeBody.latestPartImpulses.set(
          partId,
          (runtimeBody.latestPartImpulses.get(partId) ?? 0) + impulse,
        );
      }
    });

    // Rapier 0.20 exposes no public joint reaction API. Estimate endpoint
    // reactions from momentum change minus gravity and forces/torques explicitly
    // submitted through this adapter. With a contact-free endpoint, its residual
    // isolates the joint reaction best. If both endpoints contact the world,
    // choose the one with fewer recorded contact points. Multi-joint attribution
    // remains approximate because endpoint residuals include every incident joint.
    const gravity: Vector3 = { x: 0, y: -9.81, z: 0 };
    for (const runtimeBody of this.activeRuntimeBodies) {
      for (const [connectionId, connection] of runtimeBody.connections) {
        if (connection.broken) {
          runtimeBody.latestConnectionLoads.set(connectionId, { forceN: 0, torqueNm: 0 });
          continue;
        }
        const fromBefore = before.get(connection.from)!;
        const toBefore = before.get(connection.to)!;
        const fromAfter = momentumSnapshot(connection.from);
        const toAfter = momentumSnapshot(connection.to);
        const fromContactCount = runtimeBody.latestContacts.get(connection.fromPartId)?.length ?? 0;
        const toContactCount = runtimeBody.latestContacts.get(connection.toPartId)?.length ?? 0;
        // When contact counts tie, the lighter endpoint usually exposes the
        // transmitted reaction with less cancellation by a heavy support.
        const useFrom = fromContactCount < toContactCount
          || (fromContactCount === toContactCount && fromBefore.mass <= toBefore.mass);
        const oldState = useFrom ? fromBefore : toBefore;
        const newState = useFrom ? fromAfter : toAfter;
        const endpoint = useFrom ? connection.from : connection.to;
        const known = this.appliedWrenches.get(endpoint) ?? { force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 } };
        const deltaVelocity = {
          x: newState.linearVelocity.x - oldState.linearVelocity.x,
          y: newState.linearVelocity.y - oldState.linearVelocity.y,
          z: newState.linearVelocity.z - oldState.linearVelocity.z,
        };
        const endpointGravity = scale(gravity, endpoint.gravityScale());
        const forceResidual = add(add(scale(deltaVelocity, oldState.mass / seconds), scale(endpointGravity, -oldState.mass)), scale(known.force, -1));
        const oldAngularMomentum = angularMomentum(oldState);
        const newAngularMomentum = angularMomentum(newState);
        const torqueResidual = add(scale({
          x: newAngularMomentum.x - oldAngularMomentum.x,
          y: newAngularMomentum.y - oldAngularMomentum.y,
          z: newAngularMomentum.z - oldAngularMomentum.z,
        }, 1 / seconds), scale(known.torque, -1));
        let forceN = magnitude(forceResidual);
        let torqueNm = magnitude(torqueResidual);
        const endpointContactCount = useFrom ? fromContactCount : toContactCount;
        if (endpointContactCount > 0 && connection.actuatorOutput !== undefined && connection.axis) {
          const axis = unitVector(rotate(connection.axis, connection.from.rotation()));
          if (connection.kind === 'revolute') {
            // A blocked endpoint's contact reaction balances actuator output,
            // reduced by the angular-momentum change observed during this step.
            const observed = dot({
              x: newAngularMomentum.x - oldAngularMomentum.x,
              y: newAngularMomentum.y - oldAngularMomentum.y,
              z: newAngularMomentum.z - oldAngularMomentum.z,
            }, axis) / seconds;
            torqueNm = Math.abs(connection.actuatorOutput - observed);
          } else if (connection.kind === 'prismatic') {
            const observed = dot(deltaVelocity, axis) * oldState.mass / seconds;
            forceN = Math.abs(connection.actuatorOutput - observed);
          }
        }
        // The passive pair is a declared load borne by this Connection. The
        // momentum residual excludes submitted torques, so retain at least
        // their measured resultant without double-counting solver reaction.
        if (connection.passiveTorqueWorld) {
          torqueNm = Math.max(torqueNm, magnitude(connection.passiveTorqueWorld));
        }
        runtimeBody.latestConnectionLoads.set(connectionId, { forceN, torqueNm });
      }
    }
    for (const runtimeBody of this.activeRuntimeBodies) {
      for (const [partId, impulse] of runtimeBody.pendingPartImpulses) {
        runtimeBody.latestPartAppliedImpulses.set(partId, impulse);
        runtimeBody.latestPartImpulses.set(
          partId,
          (runtimeBody.latestPartImpulses.get(partId) ?? 0) + impulse,
        );
      }
      runtimeBody.pendingPartImpulses.clear();
    }
    // Rapier user forces and torques persist until reset. Controller outputs
    // and explicit force requests are scoped to this step, so clear the bodies
    // they touched after integration.
    for (const body of this.stepScopedForceBodies) {
      body.resetForces(false);
      body.resetTorques(false);
    }
    this.stepScopedForceBodies.clear();
    this.appliedWrenches.clear();
    for (const runtimeBody of this.activeRuntimeBodies) {
      for (const connection of runtimeBody.connections.values()) connection.actuatorOutput = undefined;
    }
  }

  readPose(handle: BodyHandle): Pose {
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    const position = body.translation();
    const rotation = body.rotation();
    return {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    };
  }

  readLinearVelocity(handle: BodyHandle): Vector3 {
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    const velocity = body.linvel();
    return { x: velocity.x, y: velocity.y, z: velocity.z };
  }
}
