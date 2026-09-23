import RAPIER from '@dimforge/rapier3d-compat';
import type { Connection, Entity, Material, Part, Pose, Quaternion, Vector3 } from '../core/model';
import { validateBlueprint } from '../core/model';
import type { BodyHandle, BoxSpec, PhysicsAdapter } from './PhysicsAdapter';
import type { PhysicsBody } from './PhysicsBody';

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
    return {
      entityId: entity.id,
      partHandles,
      connectionHandles,
      readPartPose: (partId: string) => {
        const handle = partHandles.get(partId);
        if (handle === undefined) throw new Error(`Unknown part id: ${partId}`);
        return this.readPose(handle);
      },
    };
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

  step(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Physics step must be positive and finite');
    this.world.timestep = seconds;
    this.world.step();
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
