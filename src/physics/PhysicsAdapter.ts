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
  /** Contact point in world coordinates for sensor and debug observation. */
  readonly point: Vector3;
  readonly impulseNs: number;
  /** Debug provenance. SensorRuntime omits it from Agent perceptions. */
  readonly otherEntityId?: string;
  readonly otherPartId?: string;
}

/** Solver contact load on one Part during the last completed step. */
export interface PartContactLoad {
  readonly impulseNs: number;
  readonly forceN: number;
}

export interface ConnectionLoad {
  /** Estimated connection force magnitude in newtons. */
  readonly forceN: number;
  /** Estimated connection torque magnitude in newton metres. */
  readonly torqueNm: number;
}

export interface RayHit {
  readonly distance: number;
  readonly point: Vector3;
}

/**
 * Options for replacing a runtime body after an intentional Blueprint edit.
 * Existing Parts keep their current world state; Parts without a surviving
 * runtime counterpart use their revised Blueprint pose plus `origin`.
 */
export interface ReconstructBodyOptions {
  readonly origin?: Vector3;
  /** Connections omitted here remain absent from the reconstructed body. */
  readonly activeConnectionIds?: readonly string[];
}

/** Backend boundary; a Blueprint instance becomes a PhysicsBody at runtime. */
export interface PhysicsAdapter {
  createBox(spec: BoxSpec): BodyHandle;
  createBody(entity: Entity, origin?: Vector3): PhysicsBody;
  /**
   * Rebuild one body after an intentional structural edit while preserving
   * surviving Part pose and velocity state.
   */
  reconstructBody(
    oldBody: PhysicsBody,
    revisedEntity: Entity,
    options?: ReconstructBodyOptions,
  ): PhysicsBody;
  /** Remove every Part, Connection, and backend object owned by one runtime body. */
  removeBody(body: PhysicsBody): void;
  /** Remove selected Parts and every Connection incident to them. */
  removeParts(body: PhysicsBody, partIds: readonly string[]): void;
  applyImpulse(handle: BodyHandle, impulse: Vector3): void;
  /** Apply force for the next physics step only. */
  applyForce(handle: BodyHandle, force: Vector3): void;
  /** Apply a force (N) at a world-space point (m) for the next physics step only. */
  applyForceAtPoint(handle: BodyHandle, force: Vector3, worldPoint: Vector3): void;
  /** Convert a Part-local point (m) to its current world position (m). */
  readWorldPoint(handle: BodyHandle, localPoint: Vector3): Vector3;
  /** Current velocity (m/s) at a Part-local point. */
  readPointVelocity(handle: BodyHandle, localPoint: Vector3): Vector3;
  /** Update friction on a static world box created with createBox. */
  setBoxFriction(handle: BodyHandle, friction: number): void;
  applyTorqueImpulse(handle: BodyHandle, torque: Vector3): void;
  /**
   * Read the physical impulse magnitude accumulated for one Part during the
   * most recent completed step. The value is in N*s and is zero when that
   * Part had no recorded external impulse or contact force in that step.
   */
  readPartImpactImpulse(body: PhysicsBody, partId: string): number;
  /** Directly applied free impulse only, excluding contact-force events. */
  readPartAppliedImpulse(body: PhysicsBody, partId: string): number;
  /** Actual narrow-phase contacts from the last completed step, excluding applied free impulses. */
  readPartContacts(body: PhysicsBody, partId: string): readonly PhysicalContact[];
  /** Contact-force events only; excludes freely applied test impulses. */
  readPartContactLoad(body: PhysicsBody, partId: string): PartContactLoad;
  /** Estimated load at a live structural connection from the most recent completed step. */
  readConnectionLoad(body: PhysicsBody, connectionId: string): ConnectionLoad;
  readPartAngularVelocity(body: PhysicsBody, partId: string): Vector3;
  /** First physical surface along a ray, excluding Parts of the sensing structure. */
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
   * magnitude for a revolute or spherical connection. The adapter applies
   * equal and opposite output to the connected bodies along their current
   * joint axis. A spherical joint uses `axis` in its from-Part local frame;
   * omitted axes default to local Z for backward-compatible scalar callers.
   * Call this once for each active output before every `step`; the adapter
   * clears these continuous contributions after that step so they do not
   * persist or accumulate unexpectedly.
  */
  applyJointOutput(body: PhysicsBody, connectionId: string, output: number, axis?: Vector3): void;
  /**
   * Read relative velocity along the current joint axis. The result is in
   * metres per second for prismatic connections and radians per second for
   * revolute or spherical connections. For spherical connections `axis` is
   * expressed in the from-Part local frame and defaults to local Z.
   * Rigid connections cannot provide this readout.
  */
  readJointVelocity(body: PhysicsBody, connectionId: string, axis?: Vector3): number;
  /**
   * Read the current coordinate relative to the Blueprint pose. The result
   * is in metres for prismatic connections and radians for revolute or
   * spherical connections, with the sign following the connection axis.
   * Spherical `axis` values are from-Part local and default to local Z.
   */
  readJointPosition(body: PhysicsBody, connectionId: string, axis?: Vector3): number;
  step(seconds: number): void;
  readPose(handle: BodyHandle): Pose;
  readLinearVelocity(handle: BodyHandle): Vector3;
}
