import type { StructuralActuator } from '../core/actuation';
import { validateBlueprint, type Blueprint, type Connection, type Entity, type EntityId, type Part, type Sensor, type Vector3 } from '../core/model';
import { WorldRuntime, type SpawnOptions } from './WorldRuntime';

/** Intentional Blueprint edits. World owns identities; the physics adapter executes reconstruction. */
export class ConstructionRuntime {
  private readonly detached = new Map<EntityId, Map<string, { connection: Connection; actuators: readonly StructuralActuator[] }>>();

  constructor(private readonly world: WorldRuntime) {}

  validate(blueprint: Blueprint): readonly string[] {
    if (!blueprint || typeof blueprint !== 'object' || !Array.isArray(blueprint.materials)
      || !Array.isArray(blueprint.parts) || !Array.isArray(blueprint.connections)) {
      return ['Blueprint must contain materials, parts, and connections arrays'];
    }
    try { return validateBlueprint(blueprint); }
    catch (error) { return [`Malformed Blueprint: ${String(error)}`]; }
  }

  spawn(entity: Entity, options: SpawnOptions = {}): void {
    const errors = [...this.validate(entity.blueprint)];
    if (entity.blueprint.parts.length === 0) errors.push('A runtime Entity requires at least one Part');
    if (errors.length) throw new Error(`Invalid Blueprint: ${errors.join('; ')}`);
    this.world.spawn(entity, options);
  }

  inspect(entityId: EntityId) {
    const entity = this.world.inspectEntity(entityId);
    if (!entity) throw new Error(`Unknown world Entity: ${entityId}`);
    return {
      entity,
      blueprint: this.world.readBlueprint(entityId),
      components: entity.componentIds.map((id) => this.world.inspectComponent(id)!),
      damage: this.world.getDamageRuntime(entityId).state,
    };
  }

  saveBlueprint(entityId: EntityId): string {
    return JSON.stringify(this.world.readBlueprint(entityId), null, 2);
  }

  loadBlueprint(json: string): Blueprint {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Blueprint).materials)
      || !Array.isArray((parsed as Blueprint).parts) || !Array.isArray((parsed as Blueprint).connections)) {
      throw new Error('Blueprint must contain materials, parts, and connections arrays');
    }
    const blueprint = parsed as Blueprint;
    const errors = [...this.validate(blueprint)];
    if (blueprint.parts.length === 0) errors.push('A runtime Entity requires at least one Part');
    if (errors.length) throw new Error(`Invalid Blueprint: ${errors.join('; ')}`);
    return blueprint;
  }

  replaceBlueprint(entityId: EntityId, blueprint: Blueprint): void {
    this.world.replaceStructure(entityId, blueprint);
    this.pruneDetached(entityId, blueprint);
  }

  addPart(entityId: EntityId, part: Part): void {
    this.edit(entityId, (source) => ({ ...source, parts: [...source.parts, part] }));
  }

  removePart(entityId: EntityId, partId: string): void {
    const source = this.world.readBlueprint(entityId);
    if (!source.parts.some((part) => part.id === partId)) throw new Error(`Unknown Part: ${partId}`);
    if (source.parts.length === 1) { this.world.removeEntity(entityId); this.detached.delete(entityId); return; }
    const connections = source.connections.filter((connection) => connection.fromPartId !== partId && connection.toPartId !== partId);
    const ids = new Set(connections.map((connection) => connection.id));
    this.world.replaceStructure(entityId, {
      ...source, parts: source.parts.filter((part) => part.id !== partId), connections,
      actuators: source.actuators?.filter((actuator) => actuator.kind === 'tension'
        ? actuator.fromPartId !== partId && actuator.toPartId !== partId
        : ids.has(actuator.connectionId)),
      sensors: source.sensors?.filter((sensor) => sensor.partId !== partId),
    });
    this.pruneDetached(entityId, this.world.readBlueprint(entityId));
  }

  updatePart(entityId: EntityId, part: Part): void {
    this.edit(entityId, (source) => {
      if (!source.parts.some((entry) => entry.id === part.id)) throw new Error(`Unknown Part: ${part.id}`);
      return { ...source, parts: source.parts.map((entry) => entry.id === part.id ? part : entry) };
    });
  }

  addConnection(entityId: EntityId, connection: Connection): void {
    this.edit(entityId, (source) => ({ ...source, connections: [...source.connections, connection] }));
  }

  removeConnection(entityId: EntityId, connectionId: string): void {
    const source = this.world.readBlueprint(entityId);
    if (!source.connections.some((connection) => connection.id === connectionId)) throw new Error(`Unknown Connection: ${connectionId}`);
    this.world.replaceStructure(entityId, {
      ...source, connections: source.connections.filter((connection) => connection.id !== connectionId),
      actuators: source.actuators?.filter((actuator) => actuator.kind === 'tension'
        || actuator.connectionId !== connectionId),
    });
  }

  /** Detachment retains the declaration for a later deliberate reattachment. */
  detach(entityId: EntityId, connectionId: string): void {
    const source = this.world.readBlueprint(entityId);
    const connection = source.connections.find((entry) => entry.id === connectionId);
    if (!connection) throw new Error(`Unknown Connection: ${connectionId}`);
    this.removeConnection(entityId, connectionId);
    let saved = this.detached.get(entityId);
    if (!saved) { saved = new Map(); this.detached.set(entityId, saved); }
    saved.set(connectionId, { connection,
      actuators: source.actuators?.filter((actuator) => actuator.kind !== 'tension' && actuator.connectionId === connectionId) ?? [],
    });
  }

  reattach(entityId: EntityId, connectionId: string): void {
    const saved = this.detached.get(entityId);
    const entry = saved?.get(connectionId);
    if (entry) {
      this.edit(entityId, (source) => ({ ...source,
        connections: [...source.connections, entry.connection],
        actuators: [...(source.actuators ?? []), ...entry.actuators],
      }));
      saved!.delete(connectionId);
      return;
    }
    const source = this.world.readBlueprint(entityId);
    if (!source.connections.some((entry) => entry.id === connectionId)) throw new Error(`Unknown detached Connection: ${connectionId}`);
    this.repair(entityId, connectionId);
  }

  listDetachedConnections(entityId: EntityId): readonly Connection[] {
    return [...(this.detached.get(entityId)?.values() ?? [])].map((entry) => entry.connection);
  }

  addActuator(entityId: EntityId, actuator: StructuralActuator): void {
    this.edit(entityId, (source) => ({ ...source, actuators: [...(source.actuators ?? []), actuator] }));
  }

  removeActuator(entityId: EntityId, actuatorId: string): void {
    this.edit(entityId, (source) => {
      if (!source.actuators?.some((entry) => entry.id === actuatorId)) throw new Error(`Unknown Actuator: ${actuatorId}`);
      return { ...source, actuators: source.actuators.filter((entry) => entry.id !== actuatorId) };
    });
  }

  addSensor(entityId: EntityId, sensor: Sensor): void {
    this.edit(entityId, (source) => ({ ...source, sensors: [...(source.sensors ?? []), sensor] }));
  }

  removeSensor(entityId: EntityId, sensorId: string): void {
    this.edit(entityId, (source) => {
      if (!source.sensors?.some((entry) => entry.id === sensorId)) throw new Error(`Unknown Sensor: ${sensorId}`);
      return { ...source, sensors: source.sensors.filter((entry) => entry.id !== sensorId) };
    });
  }

  /** Reset selected structural damage and reconstruct the corresponding physical joints. */
  repair(entityId: EntityId, targetId?: string): void {
    const blueprint = this.world.readBlueprint(entityId);
    if (targetId && !blueprint.parts.some((part) => part.id === targetId)
      && !blueprint.connections.some((connection) => connection.id === targetId)) throw new Error(`Unknown repair target: ${targetId}`);
    const targetedConnection = blueprint.connections.find((connection) => connection.id === targetId);
    const relatedIds = targetedConnection ? [targetedConnection.fromPartId, targetedConnection.toPartId]
      : blueprint.connections.filter((connection) => connection.fromPartId === targetId || connection.toPartId === targetId)
        .map((connection) => connection.id);
    const ids = targetId ? [targetId, ...relatedIds] : [
      ...blueprint.parts.map((part) => part.id), ...blueprint.connections.map((connection) => connection.id),
    ];
    this.world.replaceStructure(entityId, blueprint, ids);
  }

  applyImpact(componentId: EntityId, partId: string, impulse: Vector3): void {
    this.world.applyImpact(componentId, partId, impulse);
  }

  private edit(entityId: EntityId, change: (blueprint: Blueprint) => Blueprint): void {
    this.world.replaceStructure(entityId, change(this.world.readBlueprint(entityId)));
  }

  private pruneDetached(entityId: EntityId, blueprint: Blueprint): void {
    const saved = this.detached.get(entityId);
    if (!saved) return;
    const partIds = new Set(blueprint.parts.map((part) => part.id));
    for (const [id, entry] of saved) {
      if (!partIds.has(entry.connection.fromPartId) || !partIds.has(entry.connection.toPartId)
        || blueprint.connections.some((connection) => connection.id === id)) saved.delete(id);
    }
  }
}
