/** Stable identity is supplied by the caller; the core never invents semantic identities. */
export type EntityId = string;

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quaternion extends Vector3 {
  readonly w: number;
}

export interface Pose {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export interface Material {
  readonly id: string;
  readonly density: number;
  readonly friction: number;
  readonly restitution: number;
}

export interface Part {
  readonly id: string;
  readonly materialId: string;
  readonly geometry: { readonly kind: 'box'; readonly halfExtents: Vector3 };
}

export interface Connection {
  readonly id: string;
  readonly fromPartId: string;
  readonly toPartId: string;
  readonly kind: 'rigid' | 'joint' | 'flexible' | 'tension' | 'flow' | 'signal';
}

export interface Blueprint {
  readonly id: string;
  readonly materials: readonly Material[];
  readonly parts: readonly Part[];
  readonly connections: readonly Connection[];
}

export interface Entity {
  readonly id: EntityId;
  readonly blueprint: Blueprint;
}

/** World facts only. Intent and labels such as attacks do not belong in this type. */
export interface WorldEvent {
  readonly tick: number;
  readonly kind: 'contact' | 'structural' | 'transfer' | 'significant-state-change';
  readonly partIds: readonly string[];
  readonly causedBy?: number;
}

export function validateBlueprint(blueprint: Blueprint): string[] {
  const errors: string[] = [];
  if (!blueprint.id.trim()) errors.push('Blueprint id is required');

  const materialIds = new Set<string>();
  for (const material of blueprint.materials) {
    if (!material.id.trim() || materialIds.has(material.id)) errors.push(`Invalid or duplicate material id: ${material.id}`);
    materialIds.add(material.id);
    if (!Number.isFinite(material.density) || material.density <= 0) errors.push(`Invalid density: ${material.id}`);
    if (!Number.isFinite(material.friction) || material.friction < 0) errors.push(`Invalid friction: ${material.id}`);
    if (!Number.isFinite(material.restitution) || material.restitution < 0 || material.restitution > 1) errors.push(`Invalid restitution: ${material.id}`);
  }

  const partIds = new Set<string>();
  for (const part of blueprint.parts) {
    if (!part.id.trim() || partIds.has(part.id)) errors.push(`Invalid or duplicate part id: ${part.id}`);
    partIds.add(part.id);
    if (!materialIds.has(part.materialId)) errors.push(`Unknown material: ${part.materialId}`);
    const { x, y, z } = part.geometry.halfExtents;
    if (![x, y, z].every((value) => Number.isFinite(value) && value > 0)) errors.push(`Invalid geometry: ${part.id}`);
  }

  const connectionIds = new Set<string>();
  for (const connection of blueprint.connections) {
    if (!connection.id.trim() || connectionIds.has(connection.id)) errors.push(`Invalid or duplicate connection id: ${connection.id}`);
    connectionIds.add(connection.id);
    if (!partIds.has(connection.fromPartId) || !partIds.has(connection.toPartId)) errors.push(`Unknown connection endpoint: ${connection.id}`);
    if (connection.fromPartId === connection.toPartId) errors.push(`Self connection: ${connection.id}`);
  }
  return errors;
}
