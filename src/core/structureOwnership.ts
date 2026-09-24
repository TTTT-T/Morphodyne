import type { StructuralDamageState } from './damage';
import type { Blueprint } from './model';

/**
 * A connected structural component of one Blueprint instance.
 *
 * IDs retain the declaration order from the Blueprint. Actuators are included
 * only when their controlling connection remains an internal connected edge.
 */
export interface StructuralComponentDescriptor {
  readonly partIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly sensorIds: readonly string[];
  readonly actuatorIds: readonly string[];
}

/**
 * Derive the currently connected structural components without consulting a
 * physics backend or assigning semantic roles to Parts.
 *
 * Blueprint connections provide the graph topology. The damage state supplies
 * the current connectivity of each declared edge. Missing or extra damage
 * records are ignored, so the function remains a read-only projection of the
 * Blueprint and the available connected state.
 */
export function deriveStructuralComponents(
  blueprint: Blueprint,
  damageState: StructuralDamageState,
): readonly StructuralComponentDescriptor[] {
  const partIds = new Set(blueprint.parts.map((part) => part.id));
  const adjacency = new Map<string, string[]>();

  for (const connection of blueprint.connections) {
    if (damageState.connections[connection.id]?.connected !== true) continue;
    if (!partIds.has(connection.fromPartId) || !partIds.has(connection.toPartId)) continue;
    neighborsOf(adjacency, connection.fromPartId).push(connection.toPartId);
    neighborsOf(adjacency, connection.toPartId).push(connection.fromPartId);
  }

  const componentByPartId = new Map<string, number>();
  const components: Array<{
    readonly partIds: string[];
    readonly connectionIds: string[];
    readonly sensorIds: string[];
    readonly actuatorIds: string[];
  }> = [];

  // Starting from the Blueprint order makes component ordering stable. The
  // final member projection below also makes each part list stable regardless
  // of connection declaration order.
  for (const part of blueprint.parts) {
    if (componentByPartId.has(part.id)) continue;

    const reachable = new Set<string>([part.id]);
    const queue = [part.id];
    for (let index = 0; index < queue.length; index += 1) {
      for (const neighbor of adjacency.get(queue[index]) ?? []) {
        if (reachable.has(neighbor)) continue;
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }

    const componentIndex = components.length;
    const componentPartIds = blueprint.parts
      .filter((candidate) => reachable.has(candidate.id))
      .map((candidate) => candidate.id);
    for (const partId of componentPartIds) componentByPartId.set(partId, componentIndex);

    components.push({
      partIds: componentPartIds,
      connectionIds: [],
      sensorIds: [],
      actuatorIds: [],
    });
  }

  for (const connection of blueprint.connections) {
    if (damageState.connections[connection.id]?.connected !== true) continue;
    const fromComponent = componentByPartId.get(connection.fromPartId);
    const toComponent = componentByPartId.get(connection.toPartId);
    if (fromComponent === undefined || fromComponent !== toComponent) continue;
    components[fromComponent].connectionIds.push(connection.id);
  }

  for (const sensor of blueprint.sensors ?? []) {
    const componentIndex = componentByPartId.get(sensor.partId);
    if (componentIndex === undefined) continue;
    components[componentIndex].sensorIds.push(sensor.id);
  }

  for (const actuator of blueprint.actuators ?? []) {
    const connection = blueprint.connections.find((candidate) => candidate.id === actuator.connectionId);
    if (!connection || damageState.connections[connection.id]?.connected !== true) continue;
    const fromComponent = componentByPartId.get(connection.fromPartId);
    const toComponent = componentByPartId.get(connection.toPartId);
    if (fromComponent === undefined || fromComponent !== toComponent) continue;
    components[fromComponent].actuatorIds.push(actuator.id);
  }

  return components;
}

function neighborsOf(adjacency: Map<string, string[]>, partId: string): string[] {
  let neighbors = adjacency.get(partId);
  if (!neighbors) {
    neighbors = [];
    adjacency.set(partId, neighbors);
  }
  return neighbors;
}
