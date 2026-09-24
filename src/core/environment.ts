import type { Quaternion, Vector3 } from './model';

/** Environment geometry and conditions are world facts, independent of Entity kind. */
export interface SurfaceSpec {
  readonly id: string;
  readonly halfExtents: Vector3;
  readonly position: Vector3;
  readonly rotation?: Quaternion;
  /** Collider friction in clear weather. Rapier combines it with Part material friction. */
  readonly friction: number;
  /** Optional contact condition in rain; the Part material remains unchanged. */
  readonly wetFriction?: number;
}

export interface WaterVolumeSpec {
  readonly id: string;
  readonly min: Vector3;
  readonly max: Vector3;
  /** Fluid density for Archimedes buoyancy, in kg/m³. */
  readonly density: number;
  /** Linear drag per submerged cubic metre, in N/(m/s)/m³. */
  readonly drag: number;
}

export interface DirectionalFieldSpec {
  readonly id: string;
  /** World-space force in newtons, applied to each intersecting Part. */
  readonly force: Vector3;
  readonly min?: Vector3;
  readonly max?: Vector3;
}

export interface EnvironmentSpec {
  readonly surfaces?: readonly SurfaceSpec[];
  readonly volumes?: readonly WaterVolumeSpec[];
  readonly fields?: readonly DirectionalFieldSpec[];
  readonly state?: { readonly weather?: 'clear' | 'rain'; readonly timeOfDay?: number };
}

export interface EnvironmentState {
  readonly weather: 'clear' | 'rain';
  readonly timeOfDay: number;
  readonly daylightFactor: number;
}

export function daylightFactor(timeOfDay: number): number {
  // A deliberately simple lighting state, with no fabricated sensor effect.
  return Math.max(0.08, Math.sin(Math.PI * (timeOfDay - 6) / 12));
}
