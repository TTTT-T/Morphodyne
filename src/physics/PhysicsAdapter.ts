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
  /**
   * Read the physical impulse magnitude accumulated for one Part during the
   * most recent completed step. The value is in N*s and is zero when that
   * Part had no recorded external impulse or contact force in that step.
   */
  readPartImpactImpulse(body: PhysicsBody, partId: string): number;
  /**
   * Remove one runtime structural connection from the physics world. The
   * connected rigid bodies remain alive as independent bodies after removal.
   */
  breakConnection(body: PhysicsBody, connectionId: string): void;
  /**
   * Apply one actuator output to a joint for the next physics step.
   *
   * `output` is a force magnitude for a prismatic connection and a torque
   * magnitude for a revolute connection. The adapter applies equal and
   * opposite output to the connected bodies along their current joint axis.
   * Call this once for each active output before every `step`; the adapter
   * clears these continuous contributions after that step so they do not
   * persist or accumulate unexpectedly.
  */
  applyJointOutput(body: PhysicsBody, connectionId: string, output: number): void;
  /**
   * Read relative velocity along the current joint axis. The result is in
   * metres per second for prismatic connections and radians per second for
   * revolute connections. Rigid connections cannot provide this readout.
  */
  readJointVelocity(body: PhysicsBody, connectionId: string): number;
  /**
   * Read the current coordinate relative to the Blueprint pose. The result
   * is in metres for prismatic connections and radians for revolute
   * connections, with the sign following the connection axis.
   */
  readJointPosition(body: PhysicsBody, connectionId: string): number;
  step(seconds: number): void;
  readPose(handle: BodyHandle): Pose;
}
