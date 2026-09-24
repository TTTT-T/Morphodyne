import type { Entity, Pose, Quaternion, Vector3 } from '../core/model';
import type { PhysicsBody } from './PhysicsBody';

export interface BoxSpec {
  readonly halfExtents: Vector3;
  readonly position: Vector3;
  readonly dynamic: boolean;
  readonly rotation?: Quaternion;
  readonly friction?: number;
}

export type BodyHandle = number;

export interface PhysicalContact {
  /** Contact point in world coordinates; available only inside the sensor runtime. */
  readonly point: Vector3;
  readonly impulseNs: number;
}

export interface RayHit {
  readonly distance: number;
  readonly point: Vector3;
}

/** Backend boundary; a Blueprint instance becomes a PhysicsBody at runtime. */
export interface PhysicsAdapter {
  createBox(spec: BoxSpec): BodyHandle;
  createBody(entity: Entity, origin?: Vector3): PhysicsBody;
  /** Remove every Part, Connection, and backend object owned by one runtime body. */
  removeBody(body: PhysicsBody): void;
  /** Remove selected Parts and every Connection incident to them. */
  removeParts(body: PhysicsBody, partIds: readonly string[]): void;
  applyImpulse(handle: BodyHandle, impulse: Vector3): void;
  /** Apply force for the next physics step only. */
  applyForce(handle: BodyHandle, force: Vector3): void;
  /** Update friction on a static world box created with createBox. */
  setBoxFriction(handle: BodyHandle, friction: number): void;
  applyTorqueImpulse(handle: BodyHandle, torque: Vector3): void;
  /**
   * Read the physical impulse magnitude accumulated for one Part during the
   * most recent completed step. The value is in N*s and is zero when that
   * Part had no recorded external impulse or contact force in that step.
   */
  readPartImpactImpulse(body: PhysicsBody, partId: string): number;
  /** Actual narrow-phase contacts from the last completed step, excluding applied free impulses. */
  readPartContacts(body: PhysicsBody, partId: string): readonly PhysicalContact[];
  readPartAngularVelocity(body: PhysicsBody, partId: string): Vector3;
  /** First physical surface along a ray, excluding only the mounting Part collider. */
  castSensorRay(origin: Vector3, direction: Vector3, range: number, excludePartHandle: BodyHandle): RayHit | null;
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
  readLinearVelocity(handle: BodyHandle): Vector3;
}
