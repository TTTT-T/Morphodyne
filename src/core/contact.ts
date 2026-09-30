import type { Vector3 } from './model';

/** One loaded narrow-phase manifold during one physical substep. SI units. */
export interface ContactPatch {
  readonly point: Vector3;
  /** Outward from the inspected collider, in world space. */
  readonly normal: Vector3;
  readonly forceN: number;
  readonly impulseNs: number;
  readonly effectiveAreaM2: number;
  readonly pressurePa: number;
  readonly seconds: number;
  /** Debug provenance only; excluded from Sensor/Agent observations. */
  readonly otherEntityId?: string;
  readonly otherPartId?: string;
}
