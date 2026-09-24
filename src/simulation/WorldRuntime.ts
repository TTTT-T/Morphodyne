import type { ControlSignal, EnergySourceSpec } from '../core/actuation';
import { createDamageState, type DamageEvent, type StructuralDamageState } from '../core/damage';
import type { EnvironmentSpec } from '../core/environment';
import { validateBlueprint, type Blueprint, type Entity, type EntityId, type Pose, type Vector3 } from '../core/model';
import { deriveStructuralComponents } from '../core/structureOwnership';
import type { ConnectionLoad, PhysicalContact, PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';
import { FixedStepSimulation } from './FixedStepSimulation';
import { EnvironmentRuntime, type PartEnvironmentView, type PhysicalPartView } from './EnvironmentRuntime';
import { ActuatorRuntime } from './ActuatorRuntime';
import { EnergyRuntime, type EnergyState } from './EnergyRuntime';
import { SensorRuntime, type SensorObservation } from './SensorRuntime';
import { StructuralDamageRuntime } from './StructuralDamageRuntime';

export type WorldControlSource = (seconds: number, tick: number) => readonly ControlSignal[];

export interface SpawnOptions {
  readonly origin?: Vector3;
  /** Energy and control may be supplied for a machine without an Agent. */
  readonly energy?: EnergySourceSpec;
  readonly control?: WorldControlSource;
  /** Optional Agent composition uses the same signal path as external control. */
  readonly agent?: { readonly control: WorldControlSource };
}

export interface StructuralComponentView {
  readonly id: EntityId;
  readonly sourceEntityId: EntityId;
  readonly partIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly actuatorIds: readonly string[];
  readonly sensorIds: readonly string[];
  readonly detached: boolean;
  readonly separatedBy?: { readonly connectionId: string; readonly tick: number };
}

export interface RuntimeEntityView {
  readonly id: EntityId;
  readonly blueprintId: string;
  readonly partIds: readonly string[];
  readonly componentIds: readonly EntityId[];
  readonly actuatorIds: readonly string[];
  readonly sensorIds: readonly string[];
  readonly agentPresent: boolean;
}

interface ComponentRecord {
  readonly id: EntityId;
  readonly anchorPartId: string;
  view: StructuralComponentView;
  sensor?: SensorRuntime;
}

interface EntityRecord {
  entity: Entity;
  body: PhysicsBody;
  damage: StructuralDamageRuntime;
  readonly origin: Vector3;
  readonly energy?: EnergyRuntime;
  actuator?: ActuatorRuntime;
  control?: WorldControlSource;
  agent?: { readonly control: WorldControlSource };
  readonly components: Map<EntityId, ComponentRecord>;
  readonly livePartIds: Set<string>;
}

/** Owns world identity, structure membership, runtime instances, and fixed time. */
export class WorldRuntime {
  private readonly entities = new Map<EntityId, EntityRecord>();
  private readonly issuedIds = new Set<EntityId>();
  private nextFragmentId = 1;
  private readonly simulation: FixedStepSimulation;
  readonly environment: EnvironmentRuntime;

  constructor(private readonly physics: PhysicsAdapter, environment: EnvironmentSpec = {}) {
    this.environment = new EnvironmentRuntime(physics, environment);
    this.simulation = new FixedStepSimulation(physics,
      (seconds, tick) => this.beforePhysicsStep(seconds, tick),
      (seconds, tick) => this.afterPhysicsStep(seconds, tick));
  }

  get tick(): number { return this.simulation.tick; }
  get fixedSeconds(): number { return this.simulation.fixedSeconds; }
  get paused(): boolean { return this.simulation.paused; }
  set paused(value: boolean) { this.simulation.paused = value; }
  advance(elapsedSeconds: number): number { return this.simulation.advance(elapsedSeconds); }
  stepOnce(): void { this.simulation.stepOnce(); }
  setTimeScale(value: number): void { this.simulation.setTimeScale(value); }

  spawn(entity: Entity, options: SpawnOptions = {}): RuntimeEntityView {
    if (!entity.id.trim() || this.issuedIds.has(entity.id)) throw new Error(`Invalid or reused world Entity id: ${entity.id}`);
    if (options.control && options.agent) throw new Error('Choose one control source');
    if ((options.control || options.agent) && (entity.blueprint.actuators?.length ?? 0) > 0 && !options.energy) {
      throw new Error(`Controlled actuators require an energy source: ${entity.id}`);
    }
    const energy = options.energy ? new EnergyRuntime(options.energy) : undefined;
    const body = this.physics.createBody(entity, options.origin);
    const damage = new StructuralDamageRuntime(entity.blueprint, this.physics, body);
    const record: EntityRecord = {
      entity, body, damage, origin: options.origin ?? { x: 0, y: 0, z: 0 },
      ...(energy ? { energy } : {}),
      ...(options.control ? { control: options.control } : {}),
      ...(options.agent ? { agent: options.agent } : {}),
      ...(energy && (entity.blueprint.actuators?.length ?? 0) > 0
        ? { actuator: new ActuatorRuntime(entity.blueprint, this.physics, body, energy) } : {}),
      components: new Map(), livePartIds: new Set(entity.blueprint.parts.map((part) => part.id)),
    };
    this.entities.set(entity.id, record);
    this.issuedIds.add(entity.id);
    this.reconcileComponents(record);
    return this.inspectEntity(entity.id)!;
  }

  removeEntity(id: EntityId): void {
    const record = this.requireEntity(id);
    this.physics.removeBody(record.body);
    this.entities.delete(id);
  }

  /** Remove one physically independent component, preserving its source Entity history. */
  removeComponent(id: EntityId): void {
    const record = this.findComponentOwner(id);
    const component = record.components.get(id)!;
    this.physics.removeParts(record.body, component.view.partIds);
    record.damage.retireParts(component.view.partIds);
    for (const partId of component.view.partIds) record.livePartIds.delete(partId);
    record.components.delete(id);
    if (id === record.entity.id) { record.control = undefined; record.agent = undefined; }
    this.rebuildActuator(record);
    if (record.livePartIds.size === 0) this.entities.delete(record.entity.id);
    else this.reconcileComponents(record);
  }

  listEntities(): readonly RuntimeEntityView[] {
    return [...this.entities.keys()].map((id) => this.inspectEntity(id)!);
  }

  inspectEntity(id: EntityId): RuntimeEntityView | undefined {
    const record = this.entities.get(id);
    if (!record) return undefined;
    const components = [...record.components.values()].map((entry) => entry.view);
    return {
      id, blueprintId: record.entity.blueprint.id,
      partIds: [...record.livePartIds], componentIds: components.map((entry) => entry.id),
      actuatorIds: components.flatMap((entry) => entry.actuatorIds),
      sensorIds: components.flatMap((entry) => entry.sensorIds),
      agentPresent: !!record.agent,
    };
  }

  /** A snapshot of the currently owned structure, excluding previously removed Parts. */
  readBlueprint(id: EntityId): Blueprint {
    const record = this.requireEntity(id);
    const source = record.entity.blueprint;
    const parts = source.parts.filter((part) => record.livePartIds.has(part.id));
    const connections = source.connections.filter((connection) => record.livePartIds.has(connection.fromPartId)
      && record.livePartIds.has(connection.toPartId));
    const connectionIds = new Set(connections.map((connection) => connection.id));
    return {
      ...source, parts, connections,
      actuators: source.actuators?.filter((actuator) => actuator.kind === 'tension'
        ? record.livePartIds.has(actuator.fromPartId) && record.livePartIds.has(actuator.toPartId)
        : connectionIds.has(actuator.connectionId)),
      sensors: source.sensors?.filter((sensor) => record.livePartIds.has(sensor.partId)),
    };
  }

  /** Construction's explicit reconstruction boundary. Existing identity and intact damage survive edits. */
  replaceStructure(id: EntityId, blueprint: Blueprint, resetDamageIds: readonly string[] = []): RuntimeEntityView {
    const record = this.requireEntity(id);
    const errors = validateBlueprint(blueprint);
    if (blueprint.parts.length === 0) errors.push('A runtime Entity requires at least one Part');
    if (errors.length) throw new Error(`Invalid Blueprint: ${errors.join('; ')}`);
    const previous = record.damage.state;
    const fresh = createDamageState(blueprint);
    const reset = new Set(resetDamageIds);
    const parts: Record<string, StructuralDamageState['parts'][string]> = { ...fresh.parts };
    const connections: Record<string, StructuralDamageState['connections'][string]> = { ...fresh.connections };
    const materialChanged = new Set<string>();
    for (const part of blueprint.parts) {
      const oldPart = record.entity.blueprint.parts.find((candidate) => candidate.id === part.id);
      const oldMaterial = record.entity.blueprint.materials.find((material) => material.id === oldPart?.materialId);
      const newMaterial = blueprint.materials.find((material) => material.id === part.materialId);
      if (JSON.stringify(oldMaterial) !== JSON.stringify(newMaterial)) materialChanged.add(part.id);
      if (!reset.has(part.id) && !materialChanged.has(part.id) && oldPart
        && JSON.stringify(oldPart) === JSON.stringify(part) && previous.parts[part.id]) {
        parts[part.id] = previous.parts[part.id];
      }
    }
    for (const connection of blueprint.connections) {
      const oldConnection = record.entity.blueprint.connections.find((candidate) => candidate.id === connection.id);
      if (!reset.has(connection.id) && !materialChanged.has(connection.fromPartId)
        && !materialChanged.has(connection.toPartId) && oldConnection && JSON.stringify(oldConnection) === JSON.stringify(connection)
        && previous.connections[connection.id]) connections[connection.id] = previous.connections[connection.id];
    }
    const nextState: StructuralDamageState = { parts, connections };
    const nextEntity = { id, blueprint };
    const nextBody = this.physics.reconstructBody(record.body, nextEntity, {
      origin: record.origin,
      activeConnectionIds: blueprint.connections.filter((connection) => connections[connection.id].connected)
        .map((connection) => connection.id),
    });
    const nextDamage = new StructuralDamageRuntime(blueprint, this.physics, nextBody, nextState);
    record.entity = nextEntity;
    record.body = nextBody;
    record.damage = nextDamage;
    record.livePartIds.clear();
    for (const part of blueprint.parts) record.livePartIds.add(part.id);
    for (const component of record.components.values()) component.sensor = undefined;
    this.reconcileComponents(record);
    this.rebuildActuator(record);
    return this.inspectEntity(id)!;
  }

  /** An intentional physical impulse, routed through world ownership. */
  applyImpact(componentId: EntityId, partId: string, impulse: Vector3): void {
    const record = this.findComponentOwner(componentId);
    if (!record.components.get(componentId)!.view.partIds.includes(partId)) {
      throw new Error(`Part ${partId} is not owned by component ${componentId}`);
    }
    this.physics.applyImpulse(record.body.partHandles.get(partId)!, impulse);
  }

  listComponents(): readonly StructuralComponentView[] {
    return [...this.entities.values()].flatMap((record) => [...record.components.values()].map((entry) => entry.view));
  }

  inspectComponent(id: EntityId): StructuralComponentView | undefined {
    for (const record of this.entities.values()) {
      const component = record.components.get(id);
      if (component) return component.view;
    }
    return undefined;
  }

  readPartPose(componentId: EntityId, partId: string): Pose {
    const record = this.findComponentOwner(componentId);
    if (!record.components.get(componentId)!.view.partIds.includes(partId)) {
      throw new Error(`Part ${partId} is not owned by component ${componentId}`);
    }
    return record.body.readPartPose(partId);
  }

  readObservations(componentId: EntityId): readonly SensorObservation[] {
    return this.findComponentOwner(componentId).components.get(componentId)!.sensor?.readObservations() ?? [];
  }

  readSensorRuntime(componentId: EntityId): SensorRuntime | undefined {
    return this.findComponentOwner(componentId).components.get(componentId)!.sensor;
  }

  /** Controlled adapter access for integration code; never use a Rapier handle as world identity. */
  getPhysicsBody(entityId: EntityId): PhysicsBody {
    return this.requireEntity(entityId).body;
  }

  getDamageRuntime(entityId: EntityId): StructuralDamageRuntime {
    return this.requireEntity(entityId).damage;
  }

  /** Debug/inspection state. Agent control does not receive this world truth. */
  inspectEnergy(entityId: EntityId): EnergyState | undefined {
    return this.requireEntity(entityId).energy?.state;
  }

  /** Debug inspection of the latest completed physics step; never fed to Agent control. */
  readConnectionLoad(entityId: EntityId, connectionId: string): ConnectionLoad | undefined {
    const record = this.requireEntity(entityId);
    if (!record.body.connectionHandles.has(connectionId)) return undefined;
    return this.physics.readConnectionLoad(record.body, connectionId);
  }

  /** Debug-only physical contact samples for a selected Part. */
  readPartContacts(entityId: EntityId, partId: string): readonly PhysicalContact[] {
    const record = this.requireEntity(entityId);
    if (!record.body.partHandles.has(partId)) return [];
    return this.physics.readPartContacts(record.body, partId);
  }

  /** Debug-only velocity at the selected Part origin. */
  readPartVelocity(entityId: EntityId, partId: string): Vector3 | undefined {
    const record = this.requireEntity(entityId);
    const handle = record.body.partHandles.get(partId);
    return handle === undefined ? undefined : this.physics.readPointVelocity(handle, { x: 0, y: 0, z: 0 });
  }

  /** Debug truth only; Agent control receives observations through SensorRuntime. */
  inspectPartEnvironment(componentId: EntityId, partId: string): PartEnvironmentView {
    const record = this.findComponentOwner(componentId);
    if (!record.components.get(componentId)!.view.partIds.includes(partId)) {
      throw new Error(`Part ${partId} is not owned by component ${componentId}`);
    }
    const part = record.entity.blueprint.parts.find((candidate) => candidate.id === partId)!;
    return this.environment.inspectPart({
      handle: record.body.partHandles.get(partId)!, geometry: part.geometry, pose: record.body.readPartPose(partId),
    });
  }

  private physicalParts(): PhysicalPartView[] {
    const parts: PhysicalPartView[] = [];
    for (const record of this.entities.values()) {
      for (const part of record.entity.blueprint.parts) {
        if (!record.livePartIds.has(part.id)) continue;
        parts.push({ handle: record.body.partHandles.get(part.id)!, geometry: part.geometry,
          pose: record.body.readPartPose(part.id) });
      }
    }
    return parts;
  }

  private beforePhysicsStep(seconds: number, tick: number): void {
    this.environment.beforePhysicsStep(this.physicalParts());
    for (const record of this.entities.values()) {
      const signals = record.agent?.control(seconds, tick) ?? record.control?.(seconds, tick) ?? [];
      if (!record.actuator) continue;
      const active = new Set([...record.components.values()].flatMap((component) => component.view.actuatorIds));
      record.actuator.step(signals.filter((signal) => active.has(signal.actuatorId)), seconds);
    }
  }

  private afterPhysicsStep(seconds: number, tick: number): void {
    for (const record of this.entities.values()) {
      const events = record.damage.afterPhysicsStep(tick, seconds);
      this.reconcileComponents(record, events, tick);
      for (const component of record.components.values()) component.sensor?.afterPhysicsStep(tick, seconds);
    }
  }

  private reconcileComponents(record: EntityRecord, events: readonly DamageEvent[] = [], tick = this.tick): void {
    const groups = deriveStructuralComponents(record.entity.blueprint, record.damage.state)
      .map((group) => ({ ...group, partIds: group.partIds.filter((partId) => record.livePartIds.has(partId)) }))
      .filter((group) => group.partIds.length > 0);
    const previous = [...record.components.values()];
    const next = new Map<EntityId, ComponentRecord>();
    for (const group of groups) {
      const matched = previous.find((entry) => group.partIds.includes(entry.anchorPartId) && !next.has(entry.id));
      const id = matched?.id ?? (next.size === 0 && previous.length === 0 ? record.entity.id : this.newFragmentId(record.entity.id));
      const connectionIds = group.connectionIds.filter((connectionId) => record.body.connectionHandles.has(connectionId));
      const cause = !matched && previous.length > 0 ? events.find((event) => event.kind === 'separation'
        && event.target === 'connection' && event.partIds.some((partId) => group.partIds.includes(partId))) : undefined;
      const view: StructuralComponentView = {
        id, sourceEntityId: record.entity.id, partIds: group.partIds,
        connectionIds,
        actuatorIds: group.actuatorIds.filter((actuatorId) => record.entity.blueprint.actuators
          ?.some((actuator) => actuator.id === actuatorId && (actuator.kind === 'tension'
            ? record.livePartIds.has(actuator.fromPartId) && record.livePartIds.has(actuator.toPartId)
            : connectionIds.includes(actuator.connectionId)))),
        sensorIds: group.sensorIds,
        detached: groups.length === 1 ? false : (matched?.view.detached ?? previous.length > 0),
        ...(groups.length > 1 && matched?.view.separatedBy ? { separatedBy: matched.view.separatedBy }
          : cause ? { separatedBy: { connectionId: cause.connectionId, tick } } : {}),
      };
      const anchorPartId = matched?.anchorPartId ?? group.partIds[0];
      const sensor = matched?.sensor ?? ((group.sensorIds.length > 0)
        ? new SensorRuntime(record.entity.blueprint, anchorPartId, this.physics, record.body, () => record.damage.state)
        : undefined);
      next.set(id, { id, anchorPartId, view, ...(sensor ? { sensor } : {}) });
    }
    record.components.clear();
    for (const [id, component] of next) record.components.set(id, component);
  }

  private rebuildActuator(record: EntityRecord): void {
    if (!record.energy) return;
    const active = new Set([...record.components.values()].flatMap((component) => component.view.actuatorIds));
    const blueprint = { ...record.entity.blueprint,
      actuators: record.entity.blueprint.actuators?.filter((actuator) => active.has(actuator.id)) };
    record.actuator = new ActuatorRuntime(blueprint, this.physics, record.body, record.energy);
  }

  private newFragmentId(sourceId: EntityId): EntityId {
    let id: EntityId;
    do { id = `${sourceId}::fragment-${this.nextFragmentId++}`; } while (this.issuedIds.has(id));
    this.issuedIds.add(id);
    return id;
  }

  private requireEntity(id: EntityId): EntityRecord {
    const record = this.entities.get(id);
    if (!record) throw new Error(`Unknown world Entity: ${id}`);
    return record;
  }

  private findComponentOwner(id: EntityId): EntityRecord {
    for (const record of this.entities.values()) if (record.components.has(id)) return record;
    throw new Error(`Unknown structural component: ${id}`);
  }
}
