import type { DirectionalFieldSpec, EnvironmentSpec, EnvironmentState, SurfaceSpec, WaterVolumeSpec } from '../core/environment';
import { daylightFactor } from '../core/environment';
import type { Geometry, Pose, Quaternion, Vector3 } from '../core/model';
import type { BodyHandle, PhysicsAdapter } from '../physics/PhysicsAdapter';

export interface SurfaceView extends SurfaceSpec {
  readonly handle: BodyHandle;
  readonly effectiveFriction: number;
}

export interface PhysicalPartView {
  readonly handle: BodyHandle;
  readonly geometry: Geometry;
  readonly pose: Pose;
}

export interface PartEnvironmentView {
  readonly surfaceIds: readonly string[];
  readonly volumeIds: readonly string[];
  readonly fieldIds: readonly string[];
}

const GRAVITY = 9.81;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 } as const;

function finiteVector(value: Vector3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function validBounds(min: Vector3, max: Vector3): boolean {
  return finiteVector(min) && finiteVector(max) && min.x < max.x && min.y < max.y && min.z < max.z;
}

function assertSpec(spec: EnvironmentSpec): void {
  const ids = new Set<string>();
  for (const entry of [...(spec.surfaces ?? []), ...(spec.volumes ?? []), ...(spec.fields ?? [])]) {
    if (!entry.id.trim() || ids.has(entry.id)) throw new Error(`Invalid or duplicate environment id: ${entry.id}`);
    ids.add(entry.id);
  }
  for (const surface of spec.surfaces ?? []) {
    if (!finiteVector(surface.position) || !finiteVector(surface.halfExtents)
      || Object.values(surface.halfExtents).some((value) => value <= 0)
      || !Number.isFinite(surface.friction) || surface.friction < 0
      || (surface.wetFriction !== undefined && (!Number.isFinite(surface.wetFriction) || surface.wetFriction < 0))) {
      throw new Error(`Invalid surface: ${surface.id}`);
    }
    if (surface.rotation) {
      const { x, y, z, w } = surface.rotation;
      if (![x, y, z, w].every(Number.isFinite) || Math.abs(x * x + y * y + z * z + w * w - 1) > 1e-5) {
        throw new Error(`Invalid surface rotation: ${surface.id}`);
      }
    }
  }
  for (const volume of spec.volumes ?? []) {
    if (!validBounds(volume.min, volume.max) || !Number.isFinite(volume.density) || volume.density < 0
      || !Number.isFinite(volume.drag) || volume.drag < 0) throw new Error(`Invalid water volume: ${volume.id}`);
  }
  for (const field of spec.fields ?? []) {
    if (!finiteVector(field.force) || ((field.min === undefined) !== (field.max === undefined))
      || (field.min && field.max && !validBounds(field.min, field.max))) throw new Error(`Invalid field: ${field.id}`);
  }
  if (spec.state?.weather && spec.state.weather !== 'clear' && spec.state.weather !== 'rain') throw new Error('Invalid weather');
  if (spec.state?.timeOfDay !== undefined && (!Number.isFinite(spec.state.timeOfDay)
    || spec.state.timeOfDay < 0 || spec.state.timeOfDay >= 24)) throw new Error('Invalid time of day');
}

function rotate(v: Vector3, q: Quaternion): Vector3 {
  const x = 2 * (q.y * v.z - q.z * v.y);
  const y = 2 * (q.z * v.x - q.x * v.z);
  const z = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * x + q.y * z - q.z * y,
    y: v.y + q.w * y + q.z * x - q.x * z,
    z: v.z + q.w * z + q.x * y - q.y * x };
}

function inside(position: Vector3, min: Vector3, max: Vector3): boolean {
  return position.x >= min.x && position.x <= max.x
    && position.y >= min.y && position.y <= max.y
    && position.z >= min.z && position.z <= max.z;
}

function onSurface(position: Vector3, surface: SurfaceSpec): boolean {
  const offset = {
    x: position.x - surface.position.x,
    y: position.y - surface.position.y,
    z: position.z - surface.position.z,
  };
  const q = surface.rotation ?? IDENTITY;
  const local = rotate(offset, { x: -q.x, y: -q.y, z: -q.z, w: q.w });
  return Math.abs(local.x) <= surface.halfExtents.x && Math.abs(local.z) <= surface.halfExtents.z
    && local.y >= -surface.halfExtents.y && local.y <= surface.halfExtents.y + 2;
}

function geometryExtent(geometry: Geometry): Vector3 {
  switch (geometry.kind) {
    case 'box': return geometry.halfExtents;
    case 'sphere': return { x: geometry.radius, y: geometry.radius, z: geometry.radius };
    case 'capsule': return { x: geometry.radius, y: geometry.halfHeight + geometry.radius, z: geometry.radius };
    case 'convex': return {
      x: (Math.max(...geometry.points.map((point) => point.x)) - Math.min(...geometry.points.map((point) => point.x))) / 2,
      y: (Math.max(...geometry.points.map((point) => point.y)) - Math.min(...geometry.points.map((point) => point.y))) / 2,
      z: (Math.max(...geometry.points.map((point) => point.z)) - Math.min(...geometry.points.map((point) => point.z))) / 2,
    };
  }
}

function geometryVolume(geometry: Geometry, extent: Vector3): number {
  switch (geometry.kind) {
    case 'box': return 8 * extent.x * extent.y * extent.z;
    case 'sphere': return 4 * Math.PI * geometry.radius ** 3 / 3;
    case 'capsule': return Math.PI * geometry.radius ** 2 * (2 * geometry.halfHeight)
      + 4 * Math.PI * geometry.radius ** 3 / 3;
    case 'convex': return 8 * extent.x * extent.y * extent.z; // bounding-box approximation
  }
}

function axisFraction(center: number, radius: number, min: number, max: number): number {
  if (radius <= 0) return center >= min && center <= max ? 1 : 0;
  return Math.max(0, Math.min(center + radius, max) - Math.max(center - radius, min)) / (2 * radius);
}

/** World-owned environment state. Only physical Parts and collider materials receive effects. */
export class EnvironmentRuntime {
  private surfaces: SurfaceView[];
  private readonly volumes: readonly WaterVolumeSpec[];
  private readonly fields: readonly DirectionalFieldSpec[];
  private weather: 'clear' | 'rain';
  private timeOfDay: number;

  constructor(private readonly physics: PhysicsAdapter, spec: EnvironmentSpec = {}) {
    assertSpec(spec);
    this.weather = spec.state?.weather ?? 'clear';
    this.timeOfDay = spec.state?.timeOfDay ?? 12;
    this.volumes = [...(spec.volumes ?? [])];
    this.fields = [...(spec.fields ?? [])];
    this.surfaces = (spec.surfaces ?? []).map((surface) => {
      const effectiveFriction = this.weather === 'rain' ? surface.wetFriction ?? surface.friction : surface.friction;
      const handle = physics.createBox({ halfExtents: surface.halfExtents, position: surface.position,
        rotation: surface.rotation, friction: effectiveFriction, dynamic: false });
      return { ...surface, handle, effectiveFriction };
    });
  }

  get state(): EnvironmentState {
    return { weather: this.weather, timeOfDay: this.timeOfDay, daylightFactor: daylightFactor(this.timeOfDay) };
  }

  listSurfaces(): readonly SurfaceView[] { return this.surfaces; }
  listVolumes(): readonly WaterVolumeSpec[] { return this.volumes; }
  listFields(): readonly DirectionalFieldSpec[] { return this.fields; }

  setWeather(weather: 'clear' | 'rain'): void {
    if (weather !== 'clear' && weather !== 'rain') throw new Error('Invalid weather');
    this.weather = weather;
    this.surfaces = this.surfaces.map((surface) => {
      const effectiveFriction = weather === 'rain' ? surface.wetFriction ?? surface.friction : surface.friction;
      this.physics.setBoxFriction(surface.handle, effectiveFriction);
      return { ...surface, effectiveFriction };
    });
  }

  setTimeOfDay(timeOfDay: number): void {
    if (!Number.isFinite(timeOfDay) || timeOfDay < 0 || timeOfDay >= 24) throw new Error('Invalid time of day');
    this.timeOfDay = timeOfDay;
  }

  inspectPart(part: PhysicalPartView): PartEnvironmentView {
    const position = part.pose.position;
    const extent = geometryExtent(part.geometry);
    return {
      surfaceIds: this.surfaces.filter((surface) => onSurface(position, surface)).map((surface) => surface.id),
      volumeIds: this.volumes.filter((volume) => this.submergedVolume(position, extent, part.geometry, volume) > 0)
        .map((volume) => volume.id),
      fieldIds: this.fields.filter((field) => !field.min || !field.max || inside(position, field.min, field.max))
        .map((field) => field.id),
    };
  }

  beforePhysicsStep(parts: readonly PhysicalPartView[]): void {
    for (const part of parts) {
      const position = part.pose.position;
      const extent = geometryExtent(part.geometry);
      let fx = 0; let fy = 0; let fz = 0;
      for (const volume of this.volumes) {
        const submerged = this.submergedVolume(position, extent, part.geometry, volume);
        if (submerged <= 0) continue;
        const velocity = this.physics.readLinearVelocity(part.handle);
        fx -= volume.drag * submerged * velocity.x;
        fy += volume.density * GRAVITY * submerged - volume.drag * submerged * velocity.y;
        fz -= volume.drag * submerged * velocity.z;
      }
      for (const field of this.fields) {
        if (field.min && field.max && !inside(position, field.min, field.max)) continue;
        fx += field.force.x; fy += field.force.y; fz += field.force.z;
      }
      if (fx !== 0 || fy !== 0 || fz !== 0) this.physics.applyForce(part.handle, { x: fx, y: fy, z: fz });
    }
  }

  private submergedVolume(position: Vector3, extent: Vector3, geometry: Geometry, volume: WaterVolumeSpec): number {
    // Low fidelity: shape volume times overlap of its world-axis bounding box.
    // This is orientation-independent and deliberately avoids fluid dynamics.
    const fraction = axisFraction(position.x, extent.x, volume.min.x, volume.max.x)
      * axisFraction(position.y, extent.y, volume.min.y, volume.max.y)
      * axisFraction(position.z, extent.z, volume.min.z, volume.max.z);
    return geometryVolume(geometry, extent) * fraction;
  }
}
