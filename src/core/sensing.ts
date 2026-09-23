import type { Blueprint } from './model';

/** A sensor-local numeric sample. Channel order is defined by the producing sensor. */
export interface Observation {
  readonly sensorId: string;
  readonly tick: number;
  readonly timestampSeconds: number;
  readonly values: readonly number[];
  /** Per-channel standard deviation in the same units as values. */
  readonly uncertainty: readonly number[];
}

/** An interpretation derived from observations; it contains no world object references. */
export interface Perception {
  readonly tick: number;
  readonly expiresAtTick: number;
  readonly label: string;
  readonly confidence: number;
  readonly values: readonly number[];
  readonly uncertainty: readonly number[];
}

export type SensorChannel = 'contact' | 'orientation' | 'angular-velocity' | 'local-velocity' | 'relative-pose' | 'joint' | 'range';

/** Numeric measurements owned by a sensor; own IDs refer only to sensed body structure. */
export interface SensorPerception extends Perception {
  readonly sensorId: string;
  readonly channel: SensorChannel;
  readonly ownConnectionId?: string;
  readonly ownPartId?: string;
}

/** The sole input contract for agent cognition. No physical runtime or world references. */
export interface AgentPerceptionView {
  readonly tick: number;
  readonly perceptions: readonly SensorPerception[];
}

/** Returns the Part IDs still connected to rootPartId through active Blueprint connections. */
export function reachablePartIds(
  blueprint: Blueprint,
  rootPartId: string,
  activeConnectionIds: ReadonlySet<string>,
): readonly string[] {
  const partIds = new Set(blueprint.parts.map((part) => part.id));
  if (!partIds.has(rootPartId)) return [];

  const adjacency = new Map<string, string[]>();
  for (const connection of blueprint.connections) {
    if (!activeConnectionIds.has(connection.id)
      || !partIds.has(connection.fromPartId)
      || !partIds.has(connection.toPartId)) continue;
    neighborsOf(adjacency, connection.fromPartId).push(connection.toPartId);
    neighborsOf(adjacency, connection.toPartId).push(connection.fromPartId);
  }

  const visited = new Set<string>([rootPartId]);
  const queue = [rootPartId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of adjacency.get(queue[index]) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return [...visited];
}

function neighborsOf(adjacency: Map<string, string[]>, partId: string): string[] {
  let neighbors = adjacency.get(partId);
  if (!neighbors) {
    neighbors = [];
    adjacency.set(partId, neighbors);
  }
  return neighbors;
}

/** Sensor IDs mounted on the currently connected component rooted at rootPartId. */
export function reachableSensorIds(
  blueprint: Blueprint,
  rootPartId: string,
  activeConnectionIds: ReadonlySet<string>,
): readonly string[] {
  const reachable = new Set(reachablePartIds(blueprint, rootPartId, activeConnectionIds));
  return (blueprint.sensors ?? []).filter((sensor) => reachable.has(sensor.partId)).map((sensor) => sensor.id);
}

/** Rejects future or stale samples and samples from sensors outside the body's live structure. */
export function canUseObservation(
  blueprint: Blueprint,
  rootPartId: string,
  activeConnectionIds: ReadonlySet<string>,
  observation: Observation,
  currentTick: number,
  maxAgeTicks: number,
): boolean {
  if (!Number.isInteger(currentTick) || !Number.isInteger(maxAgeTicks) || maxAgeTicks < 0) return false;
  if (!Number.isInteger(observation.tick) || observation.tick > currentTick || currentTick - observation.tick > maxAgeTicks) return false;
  return reachableSensorIds(blueprint, rootPartId, activeConnectionIds).includes(observation.sensorId);
}

/** A perception is current through its expiry tick and expired after it. */
export function isPerceptionCurrent(perception: Perception, currentTick: number): boolean {
  return Number.isInteger(currentTick)
    && Number.isInteger(perception.tick)
    && Number.isInteger(perception.expiresAtTick)
    && perception.tick <= currentTick
    && currentTick <= perception.expiresAtTick;
}
