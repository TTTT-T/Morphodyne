import type { Entity, Pose, Vector3 } from '../core/model';
import type { PhysicsBody } from './PhysicsBody';

export interface BoxSpec {
  readonly halfExtents: Vector3;
  readonly position: Vector3;
  readonly dynamic: boolean;
}

export type BodyHandle = number;

/** Backend boundary; a Blueprint instance becomes a PhysicsBody at runtime. */
export interface PhysicsAdapter {
  createBox(spec: BoxSpec): BodyHandle;
  createBody(entity: Entity, origin?: Vector3): PhysicsBody;
  applyImpulse(handle: BodyHandle, impulse: Vector3): void;
  applyTorqueImpulse(handle: BodyHandle, torque: Vector3): void;
  step(seconds: number): void;
  readPose(handle: BodyHandle): Pose;
}
