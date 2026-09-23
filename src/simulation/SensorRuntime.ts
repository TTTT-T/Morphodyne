import { canUseObservation, reachablePartIds, type Observation, type Perception } from '../core/sensing';
import type { Blueprint, Pose, Quaternion, Sensor, Vector3 } from '../core/model';
import type { StructuralDamageState } from '../core/damage';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';

export type SensorChannel = 'contact' | 'orientation' | 'angular-velocity' | 'relative-pose' | 'joint' | 'range';

/** Numeric values have only sensor-local meaning. No target identity or world pose is exposed. */
export interface SensorObservation extends Observation {
  readonly channel: SensorChannel;
  /** For proprioception this identifies only the body's own measured connection. */
  readonly ownConnectionId?: string;
  readonly ownPartId?: string;
}

export interface SensorPerception extends Perception {
  readonly sensorId: string;
  readonly channel: SensorChannel;
  readonly ownConnectionId?: string;
  readonly ownPartId?: string;
}

export interface AgentPerceptionView {
  readonly tick: number;
  readonly perceptions: readonly SensorPerception[];
}

interface PendingSample {
  readonly sensorId: string;
  readonly deliverTick: number;
  readonly observations: readonly SensorObservation[];
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const add = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const conjugate = (q: Quaternion): Quaternion => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z - a.x * b.y + a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function rotate(v: Vector3, q: Quaternion): Vector3 {
  const u = { x: q.y * v.z - q.z * v.y, y: q.z * v.x - q.x * v.z, z: q.x * v.y - q.y * v.x };
  const t = { x: 2 * u.x, y: 2 * u.y, z: 2 * u.z };
  return { x: v.x + q.w * t.x + q.y * t.z - q.z * t.y,
    y: v.y + q.w * t.y + q.z * t.x - q.x * t.z,
    z: v.z + q.w * t.z + q.x * t.y - q.y * t.x };
}

function compose(part: Pose, local: Pose): Pose {
  return { position: add(part.position, rotate(local.position, part.rotation)), rotation: multiply(part.rotation, local.rotation) };
}

function yaw(v: Vector3, radians: number): Vector3 {
  const c = Math.cos(radians); const s = Math.sin(radians);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

function unit(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Sole simulation owner of physical reads used to produce agent-facing information. */
export class SensorRuntime {
  private readonly latest = new Map<string, readonly SensorObservation[]>();
  private readonly pending: PendingSample[] = [];
  private activeSensorIds: readonly string[] = [];
  private view: AgentPerceptionView = { tick: -1, perceptions: [] };

  constructor(
    private readonly blueprint: Blueprint,
    private readonly rootPartId: string,
    private readonly physics: PhysicsAdapter,
    private readonly body: PhysicsBody,
    private readonly damage: () => StructuralDamageState,
    private readonly random: () => number = seededRandom(1),
  ) {}

  /** Run after physics and structural damage so disconnected sensors vanish on that same tick. */
  afterPhysicsStep(tick: number, secondsPerTick: number): void {
    const state = this.damage();
    const activeConnections = new Set(Object.values(state.connections).filter((entry) => entry.connected).map((entry) => entry.connectionId));
    const reachable = new Set(reachablePartIds(this.blueprint, this.rootPartId, activeConnections));
    const active = new Set((this.blueprint.sensors ?? []).filter((sensor) =>
      reachable.has(sensor.partId) && state.parts[sensor.partId]?.damage.state !== 'fractured').map((sensor) => sensor.id));
    this.activeSensorIds = [...active];
    for (const id of this.latest.keys()) if (!active.has(id)) this.latest.delete(id);
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      if (!active.has(this.pending[i].sensorId)) this.pending.splice(i, 1);
    }
    for (const sensor of this.blueprint.sensors ?? []) {
      if (!active.has(sensor.id) || tick % sensor.updatePeriodTicks !== 0) continue;
      const observations = this.sample(sensor, tick, secondsPerTick, reachable);
      if (sensor.latencyTicks === 0) this.latest.set(sensor.id, observations);
      else this.pending.push({ sensorId: sensor.id, deliverTick: tick + sensor.latencyTicks, observations });
    }
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const sample = this.pending[i];
      if (sample.deliverTick <= tick) {
        this.latest.set(sample.sensorId, sample.observations);
        this.pending.splice(i, 1);
      }
    }
    const perceptions: SensorPerception[] = [];
    for (const sensor of this.blueprint.sensors ?? []) {
      if (!active.has(sensor.id)) continue;
      for (const observation of this.latest.get(sensor.id) ?? []) {
        if (!canUseObservation(this.blueprint, this.rootPartId, activeConnections,
          observation, tick, sensor.updatePeriodTicks + sensor.latencyTicks)) continue;
        perceptions.push({ sensorId: sensor.id, channel: observation.channel,
          ...(observation.ownConnectionId ? { ownConnectionId: observation.ownConnectionId } : {}),
          ...(observation.ownPartId ? { ownPartId: observation.ownPartId } : {}),
          tick: observation.tick, expiresAtTick: observation.tick + sensor.updatePeriodTicks + sensor.latencyTicks,
          label: observation.channel, confidence: 1 / (1 + sensor.noise.standardDeviation),
          values: [...observation.values], uncertainty: [...observation.uncertainty] });
      }
    }
    this.view = { tick, perceptions };
  }

  /** The only object intended for a later Brain; it contains no world/physics references. */
  readAgentView(): AgentPerceptionView {
    return { tick: this.view.tick, perceptions: this.view.perceptions.map((entry) => ({
      ...entry, values: [...entry.values], uncertainty: [...entry.uncertainty],
    })) };
  }

  /** Debug tools may inspect raw sensor output, still without world identities. */
  readObservations(): readonly SensorObservation[] {
    return [...this.latest.values()].flat().map((entry) => ({ ...entry, values: [...entry.values], uncertainty: [...entry.uncertainty] }));
  }

  /** Debug status only; a later Brain receives readAgentView instead. */
  readActiveSensorIds(): readonly string[] { return [...this.activeSensorIds]; }

  private sample(sensor: Sensor, tick: number, secondsPerTick: number, reachable: ReadonlySet<string>): readonly SensorObservation[] {
    const mount = compose(this.body.readPartPose(sensor.partId), sensor.localPose);
    const timestampSeconds = tick * secondsPerTick;
    const emit = (channel: SensorChannel, values: readonly number[], ownConnectionId?: string, ownPartId?: string): SensorObservation => ({
      sensorId: sensor.id, channel, tick, timestampSeconds,
      ...(ownConnectionId ? { ownConnectionId } : {}),
      ...(ownPartId ? { ownPartId } : {}),
      values: values.map((value) => this.measure(value, sensor)),
      uncertainty: values.map(() => sensor.noise.standardDeviation),
    });
    if (sensor.kind === 'contact') {
      const inverse = conjugate(mount.rotation);
      return this.physics.readPartContacts(this.body, sensor.partId)
        .map((contact) => ({ point: rotate(subtract(contact.point, mount.position), inverse), impulseNs: contact.impulseNs }))
        .filter(({ point }) => Math.hypot(point.x, point.y, point.z) <= sensor.range + 1e-4)
        .map(({ point, impulseNs }) => emit('contact', [point.x, point.y, point.z, impulseNs]));
    }
    if (sensor.kind === 'proprioception') {
      const rotation = mount.rotation;
      const angular = this.physics.readPartAngularVelocity(this.body, sensor.partId);
      const result = [emit('orientation', [rotation.x, rotation.y, rotation.z, rotation.w]),
        emit('angular-velocity', [angular.x, angular.y, angular.z])];
      const root = this.body.readPartPose(this.rootPartId);
      const rootInverse = conjugate(root.rotation);
      for (const partId of reachable) {
        const part = this.body.readPartPose(partId);
        const position = rotate(subtract(part.position, root.position), rootInverse);
        const relativeRotation = multiply(rootInverse, part.rotation);
        result.push(emit('relative-pose', [position.x, position.y, position.z,
          relativeRotation.x, relativeRotation.y, relativeRotation.z, relativeRotation.w], undefined, partId));
      }
      for (const connection of this.blueprint.connections) {
        if (connection.kind === 'rigid' || !reachable.has(connection.fromPartId) || !reachable.has(connection.toPartId)) continue;
        result.push(emit('joint', [this.physics.readJointPosition(this.body, connection.id),
          this.physics.readJointVelocity(this.body, connection.id)], connection.id));
      }
      return result;
    }
    const result: SensorObservation[] = [];
    for (let index = 0; index < sensor.resolution; index += 1) {
      const angle = sensor.resolution === 1 ? 0 : -sensor.fieldOfViewRadians / 2
        + index * sensor.fieldOfViewRadians / (sensor.resolution - 1);
      const localDirection = unit(yaw(sensor.forward, angle));
      const worldDirection = unit(rotate(localDirection, mount.rotation));
      const hit = this.physics.castSensorRay(mount.position, worldDirection, sensor.range, this.body.partHandles.get(sensor.partId)!);
      if (hit) result.push(emit('range', [localDirection.x, localDirection.y, localDirection.z,
        clamp(hit.distance, 0, sensor.range)]));
    }
    return result;
  }

  private measure(value: number, sensor: Sensor): number {
    const sigma = sensor.noise.standardDeviation;
    const jitter = sigma === 0 ? 0 : (this.random() + this.random() + this.random() + this.random() - 2) * sigma;
    const measured = value + jitter;
    if (sensor.kind === 'range') return measured;
    return Math.round(measured * sensor.resolution) / sensor.resolution;
  }
}
