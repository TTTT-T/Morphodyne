import RAPIER from '@dimforge/rapier3d-compat';
import type { Connection, Entity, Material, Part, Pose, Quaternion, Vector3 } from '../core/model';
import { validateBlueprint } from '../core/model';
import type { BodyHandle, BoxSpec, PhysicsAdapter } from './PhysicsAdapter';
import type { PhysicsBody } from './PhysicsBody';

interface RuntimeConnection {
  readonly kind: Connection['kind'];
  readonly axis?: Vector3;
  readonly from: RAPIER.RigidBody;
  readonly to: RAPIER.RigidBody;
  readonly fromAnchor: Vector3;
  readonly toAnchor: Vector3;
  readonly initialPosition?: number;
  readonly initialRelativeRotation?: Quaternion;
}

interface RuntimePhysicsBody {
  readonly connections: ReadonlyMap<string, RuntimeConnection>;
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

function jointFor(connection: Connection, fromPart: Part, toPart: Part): RAPIER.JointData {
  const { fromAnchor, toAnchor } = connection;
  if (connection.kind === 'rigid') {
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    return RAPIER.JointData.fixed(fromAnchor, identity, toAnchor,
      relativeRotation(fromPart.pose.rotation, toPart.pose.rotation));
  }
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
  private readonly bodies = new Map<BodyHandle, RAPIER.RigidBody>();
  private readonly runtimeBodies = new WeakMap<PhysicsBody, RuntimePhysicsBody>();
  private readonly actuatedBodies = new Set<RAPIER.RigidBody>();
  private nextHandle = 1;

  static async create(): Promise<RapierPhysicsAdapter> {
    await RAPIER.init();
    return new RapierPhysicsAdapter();
  }

  createBox(spec: BoxSpec): BodyHandle {
    const { x, y, z } = spec.halfExtents;
    if (![x, y, z].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Box half extents must be positive and finite');
    if (!Object.values(spec.position).every(Number.isFinite)) throw new Error('Box position must be finite');
    const descriptor = spec.dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
    descriptor.setTranslation(spec.position.x, spec.position.y, spec.position.z);
    const body = this.world.createRigidBody(descriptor);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(x, y, z), body);
    const handle = this.nextHandle++;
    this.bodies.set(handle, body);
    return handle;
  }

  createBody(entity: Entity, origin: Vector3 = { x: 0, y: 0, z: 0 }): PhysicsBody {
    const errors = validateBlueprint(entity.blueprint);
    if (!entity.id.trim()) errors.push('Entity id is required');
    if (![origin.x, origin.y, origin.z].every(Number.isFinite)) errors.push('Origin must be finite');
    if (errors.length) throw new Error(`Invalid Blueprint: ${errors.join('; ')}`);

    const materials = new Map(entity.blueprint.materials.map((material) => [material.id, material]));
    const parts = new Map(entity.blueprint.parts.map((part) => [part.id, part]));
    // Prepare every collider before touching the world; Rapier may reject a degenerate hull.
    const colliders = new Map(entity.blueprint.parts.map((part) => [
      part.id, colliderFor(part, materials.get(part.materialId)!),
    ]));
    const joints = new Map(entity.blueprint.connections.map((connection) => [
      connection.id, jointFor(connection, parts.get(connection.fromPartId)!, parts.get(connection.toPartId)!),
    ]));
    const partHandles = new Map<string, BodyHandle>();
    const connectionHandles = new Map<string, number>();
    for (const part of entity.blueprint.parts) {
      const { position, rotation } = part.pose;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x + origin.x, position.y + origin.y, position.z + origin.z)
        .setRotation(rotation));
      this.world.createCollider(colliders.get(part.id)!, body);
      const handle = this.nextHandle++;
      this.bodies.set(handle, body);
      partHandles.set(part.id, handle);
    }
    for (const connection of entity.blueprint.connections) {
      const from = this.bodies.get(partHandles.get(connection.fromPartId)!)!;
      const to = this.bodies.get(partHandles.get(connection.toPartId)!)!;
      const joint = this.world.createImpulseJoint(joints.get(connection.id)!, from, to, true);
      joint.setContactsEnabled(false);
      connectionHandles.set(connection.id, joint.handle);
    }
    const runtimeConnections = new Map<string, RuntimeConnection>();
    for (const connection of entity.blueprint.connections) {
      const fromPart = parts.get(connection.fromPartId)!;
      const toPart = parts.get(connection.toPartId)!;
      const axis = connection.kind === 'rigid' ? undefined : unitVector(connection.axis);
      const initialAxis = axis ? unitVector(rotate(axis, fromPart.pose.rotation)) : undefined;
      const initialFromAnchor = poseWorldPoint(fromPart.pose, connection.fromAnchor);
      const initialToAnchor = poseWorldPoint(toPart.pose, connection.toAnchor);
      const initialAnchorOffset = {
        x: initialToAnchor.x - initialFromAnchor.x,
        y: initialToAnchor.y - initialFromAnchor.y,
        z: initialToAnchor.z - initialFromAnchor.z,
      };
      runtimeConnections.set(connection.id, {
        kind: connection.kind,
        ...(axis ? {
          axis,
          initialPosition: dot(initialAnchorOffset, initialAxis!),
        } : {}),
        ...(connection.kind === 'revolute' ? {
          initialRelativeRotation: relativeOrientation(fromPart.pose.rotation, toPart.pose.rotation),
        } : {}),
        from: this.bodies.get(partHandles.get(connection.fromPartId)!)!,
        to: this.bodies.get(partHandles.get(connection.toPartId)!)!,
        fromAnchor: connection.fromAnchor,
        toAnchor: connection.toAnchor,
      });
    }
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
    this.runtimeBodies.set(physicsBody, { connections: runtimeConnections });
    return physicsBody;
  }

  applyImpulse(handle: BodyHandle, impulse: Vector3): void {
    if (![impulse.x, impulse.y, impulse.z].every(Number.isFinite)) throw new Error('Impulse must be finite');
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    body.applyImpulse(impulse, true);
  }

  applyTorqueImpulse(handle: BodyHandle, torque: Vector3): void {
    if (![torque.x, torque.y, torque.z].every(Number.isFinite)) throw new Error('Torque impulse must be finite');
    const body = this.bodies.get(handle);
    if (!body) throw new Error(`Unknown body handle: ${handle}`);
    body.applyTorqueImpulse(torque, true);
  }

  applyJointOutput(body: PhysicsBody, connectionId: string, output: number): void {
    if (!Number.isFinite(output)) throw new Error('Joint output must be finite');
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.kind === 'rigid' || !connection.axis) {
      throw new Error(`Cannot actuate rigid connection: ${connectionId}`);
    }

    // The Blueprint axis is local to the first body. Rapier determines the
    // current body pose; rotating it here keeps output aligned after motion.
    const axis = unitVector(rotate(connection.axis, connection.from.rotation()));
    const effort = { x: axis.x * output, y: axis.y * output, z: axis.z * output };
    if (connection.kind === 'prismatic') {
      connection.from.addForceAtPoint(negate(effort), worldPoint(connection.from, connection.fromAnchor), true);
      connection.to.addForceAtPoint(effort, worldPoint(connection.to, connection.toAnchor), true);
    } else {
      connection.from.addTorque(negate(effort), true);
      connection.to.addTorque(effort, true);
    }
    this.actuatedBodies.add(connection.from);
    this.actuatedBodies.add(connection.to);
  }

  readJointVelocity(body: PhysicsBody, connectionId: string): number {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.kind === 'rigid' || !connection.axis) {
      throw new Error(`Cannot read velocity of rigid connection: ${connectionId}`);
    }

    const axis = unitVector(rotate(connection.axis, connection.from.rotation()));
    if (connection.kind === 'revolute') {
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

  readJointPosition(body: PhysicsBody, connectionId: string): number {
    const runtimeBody = this.runtimeBodies.get(body);
    if (!runtimeBody) throw new Error('Unknown physics body');
    const connection = runtimeBody.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown connection id: ${connectionId}`);
    if (connection.kind === 'rigid' || !connection.axis) {
      throw new Error(`Cannot read position of rigid connection: ${connectionId}`);
    }

    if (connection.kind === 'prismatic') {
      const axis = unitVector(rotate(connection.axis, connection.from.rotation()));
      const fromAnchor = worldPoint(connection.from, connection.fromAnchor);
      const toAnchor = worldPoint(connection.to, connection.toAnchor);
      const offset = {
        x: toAnchor.x - fromAnchor.x,
        y: toAnchor.y - fromAnchor.y,
        z: toAnchor.z - fromAnchor.z,
      };
      return dot(offset, axis) - (connection.initialPosition ?? 0);
    }

    const initialRelativeRotation = connection.initialRelativeRotation;
    if (!initialRelativeRotation) throw new Error(`Missing initial rotation for connection: ${connectionId}`);
    const currentRelativeRotation = relativeOrientation(connection.from.rotation(), connection.to.rotation());
    const delta = quaternionMultiply(quaternionConjugate(initialRelativeRotation), currentRelativeRotation);
    return shortestSignedAngle(delta, connection.axis);
  }

  step(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Physics step must be positive and finite');
    this.world.timestep = seconds;
    this.world.step();
    // Rapier user forces and torques persist until reset. Outputs are scoped
    // to the step for which the controller submitted them, so clear only the
    // bodies touched by joint outputs after integration.
    for (const body of this.actuatedBodies) {
      body.resetForces(false);
      body.resetTorques(false);
    }
    this.actuatedBodies.clear();
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
}
