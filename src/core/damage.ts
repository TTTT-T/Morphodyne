import { validateBlueprint } from './model';
import type { Blueprint, Connection, Material } from './model';

/** Structural condition produced by load and material response. */
export type DamageCondition = 'intact' | 'degraded' | 'fractured' | 'separated';

/** Persistent material state. Values are structural quantities, not game scores. */
export interface DamageState {
  readonly state: DamageCondition;
  /** Remaining fraction of the element's nominal load capacity. */
  readonly integrity: number;
  /** Persistent deformation represented as a normalized structural measure. */
  readonly deformation: number;
  /** Accumulated load above the material yield threshold, in N·s. */
  readonly accumulatedImpulseNs: number;
}

export interface PartState {
  readonly partId: string;
  readonly materialId: string;
  readonly damage: DamageState;
  /** Current impulse magnitude that this part can carry before another failure. */
  readonly residualLoadCapacityNs: number;
}

export interface ConnectionState {
  readonly connectionId: string;
  readonly fromPartId: string;
  readonly toPartId: string;
  readonly damage: DamageState;
  /** Current impulse magnitude that this connection can carry before separation. */
  readonly residualLoadCapacityNs: number;
  readonly connected: boolean;
}

/** Immutable-by-convention structural state owned by the simulation core. */
export interface StructuralDamageState {
  readonly parts: Readonly<Record<string, PartState>>;
  readonly connections: Readonly<Record<string, ConnectionState>>;
}

export interface ConnectionLoad {
  readonly connectionId: string;
  /** Magnitude of the impulse carried by the connection, in N·s. */
  readonly impulseNs: number;
  readonly tick?: number;
}

export type DamageEventKind = 'deformation' | 'fracture' | 'separation';

/** A factual state transition caused by one measured connection load. */
export interface DamageEvent {
  readonly kind: DamageEventKind;
  readonly target: 'part' | 'connection';
  readonly targetId: string;
  readonly partId?: string;
  readonly connectionId: string;
  readonly partIds: readonly [string, string];
  readonly impulseNs: number;
  readonly tick?: number;
  readonly previousState: DamageCondition;
  readonly state: DamageCondition;
  readonly integrity: number;
  readonly residualLoadCapacityNs: number;
}

export interface DamageApplication {
  readonly state: StructuralDamageState;
  readonly events: readonly DamageEvent[];
  readonly connection: ConnectionState;
  readonly parts: readonly [PartState, PartState];
}

const DEFAULT_MATERIAL_TOUGHNESS_IMPULSE_NS = 100;
const DEFAULT_YIELD_FRACTION = 0.5;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function materialToughness(material: Material): number {
  return material.toughnessImpulseNs ?? DEFAULT_MATERIAL_TOUGHNESS_IMPULSE_NS;
}

function materialYield(material: Material): number {
  return material.yieldImpulseNs ?? materialToughness(material) * DEFAULT_YIELD_FRACTION;
}

function materialFor(blueprint: Blueprint, materialId: string): Material {
  const material = blueprint.materials.find((candidate) => candidate.id === materialId);
  if (!material) throw new Error(`Unknown material: ${materialId}`);
  return material;
}

function connectionFor(blueprint: Blueprint, connectionId: string): Connection {
  const connection = blueprint.connections.find((candidate) => candidate.id === connectionId);
  if (!connection) throw new Error(`Unknown connection: ${connectionId}`);
  return connection;
}

function connectionCapacity(connection: Connection, fromMaterial: Material, toMaterial: Material): number {
  return connection.strengthImpulseNs ?? Math.min(materialToughness(fromMaterial), materialToughness(toMaterial));
}

function connectionYield(fromMaterial: Material, toMaterial: Material): number {
  return Math.min(materialYield(fromMaterial), materialYield(toMaterial));
}

function initialDamage(): DamageState {
  return {
    state: 'intact',
    integrity: 1,
    deformation: 0,
    accumulatedImpulseNs: 0,
  };
}

/** Create intact structural state for every declared Part and Connection. */
export function createDamageState(blueprint: Blueprint): StructuralDamageState {
  const errors = validateBlueprint(blueprint);
  if (errors.length > 0) throw new Error(`Cannot create damage state: ${errors.join('; ')}`);

  const parts: Record<string, PartState> = {};
  for (const part of blueprint.parts) {
    const material = materialFor(blueprint, part.materialId);
    const capacity = materialToughness(material);
    parts[part.id] = {
      partId: part.id,
      materialId: part.materialId,
      damage: initialDamage(),
      residualLoadCapacityNs: capacity,
    };
  }

  const connections: Record<string, ConnectionState> = {};
  for (const connection of blueprint.connections) {
    const from = parts[connection.fromPartId];
    const to = parts[connection.toPartId];
    if (!from || !to) throw new Error(`Unknown connection endpoint: ${connection.id}`);
    const capacity = connectionCapacity(
      connection,
      materialFor(blueprint, from.materialId),
      materialFor(blueprint, to.materialId),
    );
    connections[connection.id] = {
      connectionId: connection.id,
      fromPartId: connection.fromPartId,
      toPartId: connection.toPartId,
      damage: initialDamage(),
      residualLoadCapacityNs: capacity,
      connected: true,
    };
  }

  return { parts, connections };
}

export function getPartState(state: StructuralDamageState, partId: string): PartState {
  const part = state.parts[partId];
  if (!part) throw new Error(`Unknown part state: ${partId}`);
  return part;
}

export function getConnectionState(state: StructuralDamageState, connectionId: string): ConnectionState {
  const connection = state.connections[connectionId];
  if (!connection) throw new Error(`Unknown connection state: ${connectionId}`);
  return connection;
}

export function getConnectionLoadCapacity(state: StructuralDamageState, connectionId: string): number {
  return getConnectionState(state, connectionId).residualLoadCapacityNs;
}

interface EvolvedDamage {
  readonly damage: DamageState;
  readonly residualLoadCapacityNs: number;
  readonly accumulatedChanged: boolean;
}

function evolveDamage(
  current: DamageState,
  nominalCapacityNs: number,
  yieldImpulseNs: number,
  impulseNs: number,
  residualCapacityNs: number,
  forceFracture: boolean,
): EvolvedDamage {
  const excessImpulseNs = Math.max(0, impulseNs - yieldImpulseNs);
  const accumulatedImpulseNs = Math.min(
    nominalCapacityNs,
    current.accumulatedImpulseNs + excessImpulseNs,
  );
  const accumulatedChanged = accumulatedImpulseNs > current.accumulatedImpulseNs;
  const fractures = forceFracture
    || current.state === 'fractured'
    || current.state === 'separated'
    || impulseNs >= residualCapacityNs
    || accumulatedImpulseNs >= nominalCapacityNs;

  if (fractures) {
    return {
      damage: {
        state: 'fractured',
        integrity: 0,
        deformation: 1,
        accumulatedImpulseNs,
      },
      residualLoadCapacityNs: 0,
      accumulatedChanged,
    };
  }

  const deformation = clampUnit(accumulatedImpulseNs / nominalCapacityNs);
  return {
    damage: {
      state: accumulatedImpulseNs > 0 ? 'degraded' : current.state,
      integrity: 1 - deformation,
      deformation,
      accumulatedImpulseNs,
    },
    residualLoadCapacityNs: nominalCapacityNs * (1 - deformation),
    accumulatedChanged,
  };
}

function addPartEvent(
  events: DamageEvent[],
  current: PartState,
  next: PartState,
  connection: Connection,
  impulseNs: number,
  tick: number | undefined,
): void {
  const nextState = next.damage.state;
  const previousState = current.damage.state;
  const accumulatedChanged = next.damage.accumulatedImpulseNs > current.damage.accumulatedImpulseNs;
  if (nextState === 'fractured' && previousState !== 'fractured' && previousState !== 'separated') {
    events.push({
      kind: 'fracture',
      target: 'part',
      targetId: next.partId,
      partId: next.partId,
      connectionId: connection.id,
      partIds: [connection.fromPartId, connection.toPartId],
      impulseNs,
      tick,
      previousState,
      state: nextState,
      integrity: next.damage.integrity,
      residualLoadCapacityNs: next.residualLoadCapacityNs,
    });
  } else if (accumulatedChanged) {
    events.push({
      kind: 'deformation',
      target: 'part',
      targetId: next.partId,
      partId: next.partId,
      connectionId: connection.id,
      partIds: [connection.fromPartId, connection.toPartId],
      impulseNs,
      tick,
      previousState,
      state: nextState,
      integrity: next.damage.integrity,
      residualLoadCapacityNs: next.residualLoadCapacityNs,
    });
  }
}

function addConnectionEvents(
  events: DamageEvent[],
  current: ConnectionState,
  next: ConnectionState,
  impulseNs: number,
  tick: number | undefined,
): void {
  const partIds: readonly [string, string] = [next.fromPartId, next.toPartId];
  const previousState = current.damage.state;
  const nextState = next.damage.state;
  const accumulatedChanged = next.damage.accumulatedImpulseNs > current.damage.accumulatedImpulseNs;
  if (nextState === 'separated' && previousState !== 'separated') {
    if (previousState !== 'fractured') {
      events.push({
        kind: 'fracture',
        target: 'connection',
        targetId: next.connectionId,
        connectionId: next.connectionId,
        partIds,
        impulseNs,
        tick,
        previousState,
        state: 'fractured',
        integrity: 0,
        residualLoadCapacityNs: 0,
      });
    }
    events.push({
      kind: 'separation',
      target: 'connection',
      targetId: next.connectionId,
      connectionId: next.connectionId,
      partIds,
      impulseNs,
      tick,
      previousState: 'fractured',
      state: 'separated',
      integrity: next.damage.integrity,
      residualLoadCapacityNs: next.residualLoadCapacityNs,
    });
  } else if (accumulatedChanged) {
    events.push({
      kind: 'deformation',
      target: 'connection',
      targetId: next.connectionId,
      connectionId: next.connectionId,
      partIds,
      impulseNs,
      tick,
      previousState,
      state: nextState,
      integrity: next.damage.integrity,
      residualLoadCapacityNs: next.residualLoadCapacityNs,
    });
  }
}

/**
 * Apply one measured connection impulse and return a new structural state.
 * Sub-yield loads do not alter state; repeated overload accumulates deformation.
 */
export function applyConnectionLoad(
  state: StructuralDamageState,
  blueprint: Blueprint,
  load: ConnectionLoad,
): DamageApplication {
  if (!Number.isFinite(load.impulseNs) || load.impulseNs < 0) {
    throw new RangeError(`Connection impulse must be finite and non-negative: ${load.connectionId}`);
  }
  if (load.tick !== undefined && !Number.isFinite(load.tick)) {
    throw new RangeError(`Damage event tick must be finite: ${load.connectionId}`);
  }

  const connection = connectionFor(blueprint, load.connectionId);
  const currentConnection = getConnectionState(state, connection.id);
  const currentFrom = getPartState(state, connection.fromPartId);
  const currentTo = getPartState(state, connection.toPartId);

  if (!currentConnection.connected || load.impulseNs === 0) {
    return {
      state,
      events: [],
      connection: currentConnection,
      parts: [currentFrom, currentTo],
    };
  }

  const fromMaterial = materialFor(blueprint, currentFrom.materialId);
  const toMaterial = materialFor(blueprint, currentTo.materialId);
  const nextFromDamage = evolveDamage(
    currentFrom.damage,
    materialToughness(fromMaterial),
    materialYield(fromMaterial),
    load.impulseNs,
    currentFrom.residualLoadCapacityNs,
    false,
  );
  const nextToDamage = evolveDamage(
    currentTo.damage,
    materialToughness(toMaterial),
    materialYield(toMaterial),
    load.impulseNs,
    currentTo.residualLoadCapacityNs,
    false,
  );
  const nextFrom: PartState = {
    ...currentFrom,
    damage: nextFromDamage.damage,
    residualLoadCapacityNs: nextFromDamage.residualLoadCapacityNs,
  };
  const nextTo: PartState = {
    ...currentTo,
    damage: nextToDamage.damage,
    residualLoadCapacityNs: nextToDamage.residualLoadCapacityNs,
  };

  const connectionNominalCapacityNs = connectionCapacity(connection, fromMaterial, toMaterial);
  const nextConnectionDamage = evolveDamage(
    currentConnection.damage,
    connectionNominalCapacityNs,
    connectionYield(fromMaterial, toMaterial),
    load.impulseNs,
    currentConnection.residualLoadCapacityNs,
    nextFrom.damage.state === 'fractured' || nextTo.damage.state === 'fractured',
  );
  const connectionFractured = nextConnectionDamage.damage.state === 'fractured';
  const nextConnection: ConnectionState = {
    ...currentConnection,
    damage: connectionFractured
      ? { ...nextConnectionDamage.damage, state: 'separated' }
      : nextConnectionDamage.damage,
    residualLoadCapacityNs: connectionFractured
      ? 0
      : nextConnectionDamage.residualLoadCapacityNs * Math.min(nextFrom.damage.integrity, nextTo.damage.integrity),
    connected: !connectionFractured,
  };

  const events: DamageEvent[] = [];
  addPartEvent(events, currentFrom, nextFrom, connection, load.impulseNs, load.tick);
  addPartEvent(events, currentTo, nextTo, connection, load.impulseNs, load.tick);
  addConnectionEvents(events, currentConnection, nextConnection, load.impulseNs, load.tick);

  const connections: Record<string, ConnectionState> = {
    ...state.connections,
    [nextConnection.connectionId]: nextConnection,
  };
  const fracturedParts = new Set([nextFrom, nextTo]
    .filter((part) => part.damage.state === 'fractured')
    .map((part) => part.partId));
  if (fracturedParts.size > 0) {
    // A fractured rigid Part no longer provides a sound attachment for any
    // adjacent load path. Its neighboring constraints must fail as well.
    for (const adjacent of blueprint.connections) {
      if (!fracturedParts.has(adjacent.fromPartId) && !fracturedParts.has(adjacent.toPartId)) continue;
      const current = connections[adjacent.id];
      if (!current.connected) continue;
      const separated: ConnectionState = {
        ...current,
        damage: { ...current.damage, state: 'separated', integrity: 0 },
        residualLoadCapacityNs: 0,
        connected: false,
      };
      connections[adjacent.id] = separated;
      addConnectionEvents(events, current, separated, load.impulseNs, load.tick);
    }
  }

  const nextState: StructuralDamageState = {
    parts: { ...state.parts, [nextFrom.partId]: nextFrom, [nextTo.partId]: nextTo },
    connections,
  };
  return {
    state: nextState,
    events,
    connection: connections[connection.id],
    parts: [nextFrom, nextTo],
  };
}
