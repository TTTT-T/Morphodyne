import type { Vector3 } from '../core/model';

/** Rendering-only geometry. Dimensions and offsets never enter the physics Blueprint. */
export type VisualShape =
  | { readonly kind: 'box'; readonly size: Vector3 }
  | { readonly kind: 'sphere'; readonly radius: number }
  | { readonly kind: 'cylinder'; readonly radius: number; readonly depth: number }
  | { readonly kind: 'cone'; readonly radius: number; readonly height: number };

export interface VisualPiece {
  readonly shape: VisualShape;
  readonly position?: Vector3;
  /** Euler angles in radians, applied only to this decorative piece. */
  readonly rotation?: Vector3;
  readonly color: number;
  readonly metalness?: number;
  readonly roughness?: number;
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
}

/** One assembly is rigidly parented to exactly one physical Part handle. */
export interface PartVisual {
  readonly pieces: readonly VisualPiece[];
}
