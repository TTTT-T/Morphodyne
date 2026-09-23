import RAPIER from '@dimforge/rapier3d-compat';
import type { Pose } from '../core/model';
import type { BodyHandle, BoxSpec, PhysicsAdapter } from './PhysicsAdapter';

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
