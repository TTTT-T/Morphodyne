import type { Pose, Vector3 } from '../core/model';

export interface BoxSpec {
  readonly halfExtents: Vector3;
  readonly position: Vector3;
  readonly dynamic: boolean;
}

export type BodyHandle = number;

/** Backend primitive boundary. Mapping Blueprints to bodies is Phase 1. */
export interface PhysicsAdapter {
  createBox(spec: BoxSpec): BodyHandle;
  step(seconds: number): void;
  readPose(handle: BodyHandle): Pose;
}
