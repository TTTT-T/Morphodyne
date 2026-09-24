import './GodSandboxPanel.css';

import { createControlSignal, type JointActuator } from '../core/actuation';
import type {
  Blueprint,
  Connection,
  Entity,
  Geometry,
  Part,
  Sensor,
  Vector3,
} from '../core/model';
import type { StructuralDamageState } from '../core/damage';
import type { SpawnOptions, StructuralComponentView, RuntimeEntityView, WorldRuntime } from '../simulation/WorldRuntime';
import type { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import {
  createActuatedMachineBlueprint,
  createPassiveObjectBlueprint,
  createSensorPlatformBlueprint,
} from './worldFixtures';
import { createActiveBlueprint } from './activeBody';

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 } as const;
const IDENTITY_POSE = { position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY_ROTATION } as const;

/** A simple catalog entry accepted by the panel. A factory gives each spawn a fresh Blueprint object. */
export interface GodSandboxCatalogEntry {
  readonly id: string;
  readonly label?: string;
  readonly blueprint: Blueprint | (() => Blueprint);
  readonly spawnOptions?: SpawnOptions;
}

export type GodSandboxCatalog =
  | readonly GodSandboxCatalogEntry[]
  | Readonly<Record<string, Blueprint | (() => Blueprint)>>;

export interface GodSandboxPanelOptions {
  readonly catalog?: GodSandboxCatalog;
  readonly spawnOptions?: SpawnOptions;
}

export interface GodSandboxWorld {
  paused: boolean;
  stepOnce(): void;
  setTimeScale(value: number): void;
  listEntities(): readonly RuntimeEntityView[];
}

export interface GodSandboxInspection {
  readonly entity: RuntimeEntityView;
  readonly blueprint: Blueprint;
  readonly components: readonly StructuralComponentView[];
  readonly damage: StructuralDamageState;
}

/**
 * The structural surface consumed by the panel. WorldRuntime and
 * ConstructionRuntime satisfy this shape; keeping it structural also makes
 * the panel usable with a small test double without involving physics.
 */
export interface GodSandboxConstruction {
  spawn(entity: Entity, options?: SpawnOptions): void;
  inspect(entityId: string): GodSandboxInspection;
  validate(blueprint: Blueprint): readonly string[];
  saveBlueprint(entityId: string): string;
  loadBlueprint(json: string): Blueprint;
  replaceBlueprint(entityId: string, blueprint: Blueprint): void;
  addPart(entityId: string, part: Part): void;
  removePart(entityId: string, partId: string): void;
  updatePart(entityId: string, part: Part): void;
  addConnection(entityId: string, connection: Connection): void;
  removeConnection(entityId: string, connectionId: string): void;
  addActuator(entityId: string, actuator: JointActuator): void;
  removeActuator(entityId: string, actuatorId: string): void;
  addSensor(entityId: string, sensor: Sensor): void;
  removeSensor(entityId: string, sensorId: string): void;
  detach(entityId: string, connectionId: string): void;
  reattach(entityId: string, connectionId: string): void;
  repair(entityId: string, targetId?: string): void;
  listDetachedConnections(entityId: string): readonly Connection[];
  applyImpact(componentId: string, partId: string, impulse: Vector3): void;
}

export interface GodSandboxPanelHandle {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

const DEFAULT_CATALOG: readonly GodSandboxCatalogEntry[] = [
  { id: 'passive-object', label: 'Passive object', blueprint: () => createPassiveObjectBlueprint() },
  { id: 'actuated-machine', label: 'Actuated machine', blueprint: () => createActuatedMachineBlueprint(),
    spawnOptions: { energy: { availablePowerWatts: 100 },
      control: (_seconds, tick) => [createControlSignal('machine-hinge-actuator', Math.sin(tick * 0.12))] } },
  { id: 'sensor-platform', label: 'Sensor platform', blueprint: () => createSensorPlatformBlueprint() },
  { id: 'active-body', label: 'Active body (uncontrolled)', blueprint: () => createActiveBlueprint() },
];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeId(prefix: string, used: Iterable<string>): string {
  const existing = new Set(used);
  let index = 1;
  let candidate = `${prefix}-${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

function resolveCatalog(catalog: GodSandboxCatalog | undefined): readonly GodSandboxCatalogEntry[] {
  if (!catalog) return DEFAULT_CATALOG;
  if (Array.isArray(catalog)) return catalog;
  return Object.entries(catalog).map(([id, blueprint]) => ({ id, label: id, blueprint }));
}

function blueprintFromEntry(entry: GodSandboxCatalogEntry): Blueprint {
  return typeof entry.blueprint === 'function' ? entry.blueprint() : entry.blueprint;
}

function parseNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function parsePositive(value: string, label: string): number {
  const parsed = parseNumber(value, label);
  if (parsed <= 0) throw new Error(`${label} must be greater than zero`);
  return parsed;
}

function inverseRotate(vector: Vector3, rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): Vector3 {
  // The Blueprint validator requires unit quaternions. The conjugate is the
  // inverse for those rotations and avoids a renderer or physics dependency.
  const q = { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };
  const cross = {
    x: q.y * vector.z - q.z * vector.y,
    y: q.z * vector.x - q.x * vector.z,
    z: q.x * vector.y - q.y * vector.x,
  };
  const doubled = { x: 2 * cross.x, y: 2 * cross.y, z: 2 * cross.z };
  return {
    x: vector.x + q.w * doubled.x + q.y * doubled.z - q.z * doubled.y,
    y: vector.y + q.w * doubled.y + q.z * doubled.x - q.x * doubled.z,
    z: vector.z + q.w * doubled.z + q.x * doubled.y - q.y * doubled.x,
  };
}

function labeled<T extends HTMLElement>(parent: HTMLElement, label: string, control: T): T {
  const wrapper = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  parent.append(wrapper);
  return control;
}

function textInput(value = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  return input;
}

function numberInput(value = '', step = 'any'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  input.value = value;
  return input;
}

function selectInput(): HTMLSelectElement {
  return document.createElement('select');
}

function addOption(select: HTMLSelectElement, value: string, label: string, selected = false): void {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  select.append(option);
}

function button(parent: HTMLElement, label: string, action: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', action);
  parent.append(control);
  return control;
}

function fieldset(parent: HTMLElement, legend: string): HTMLFieldSetElement {
  const set = document.createElement('fieldset');
  const title = document.createElement('legend');
  title.textContent = legend;
  set.append(title);
  parent.append(set);
  return set;
}

function selectedValue(select: HTMLSelectElement): string | undefined {
  return select.value || undefined;
}

function selectedGeometry(part: Part, kind: Geometry['kind'], a: string, b: string, c: string, pointsJson: string): Geometry {
  switch (kind) {
    case 'box':
      return { kind, halfExtents: { x: parsePositive(a, 'Half extent X'), y: parsePositive(b, 'Half extent Y'), z: parsePositive(c, 'Half extent Z') } };
    case 'sphere':
      return { kind, radius: parsePositive(a, 'Radius') };
    case 'capsule':
      return { kind, radius: parsePositive(a, 'Radius'), halfHeight: parsePositive(b, 'Half height') };
    case 'convex': {
      if (part.geometry.kind === 'convex' && pointsJson.trim() === '') return part.geometry;
      const points: unknown = JSON.parse(pointsJson);
      if (!Array.isArray(points)) throw new Error('Convex points must be a JSON array');
      return { kind, points: points as readonly Vector3[] };
    }
    default:
      throw new Error(`Unsupported geometry kind: ${String(kind)}`);
  }
}

function buildRigidConnection(id: string, from: Part, to: Part): Connection {
  const worldAnchor = from.pose.position;
  const toLocal = inverseRotate({
    x: worldAnchor.x - to.pose.position.x,
    y: worldAnchor.y - to.pose.position.y,
    z: worldAnchor.z - to.pose.position.z,
  }, to.pose.rotation);
  return {
    id,
    kind: 'rigid',
    fromPartId: from.id,
    toPartId: to.id,
    fromAnchor: { x: 0, y: 0, z: 0 },
    toAnchor: toLocal,
  };
}

function renderDamageSummary(damage: StructuralDamageState): string {
  const partStates = Object.values(damage.parts);
  const connectionStates = Object.values(damage.connections);
  const damagedParts = partStates.filter((entry) => entry.damage.state !== 'intact').length;
  const damagedConnections = connectionStates.filter((entry) => entry.damage.state !== 'intact').length;
  return `Damage: ${damagedParts}/${partStates.length} Parts · ${damagedConnections}/${connectionStates.length} Connections affected`;
}

/** Mount a small framework-free God Sandbox control surface. */
export function mountGodSandboxPanel(
  host: HTMLElement,
  world: WorldRuntime | GodSandboxWorld,
  construction: ConstructionRuntime | GodSandboxConstruction,
  onChanged: () => void = () => undefined,
  options: GodSandboxPanelOptions = {},
): GodSandboxPanelHandle {
  const catalog = resolveCatalog(options.catalog);
  const root = document.createElement('section');
  root.className = 'god-sandbox';
  root.setAttribute('aria-label', 'God Sandbox');
  host.append(root);

  const heading = document.createElement('h2');
  heading.textContent = 'God Sandbox';
  root.append(heading);
  const status = document.createElement('div');
  status.className = 'god-sandbox-status';
  status.setAttribute('role', 'status');
  root.append(status);

  let selectedEntityId: string | undefined;
  let selectedPartId: string | undefined;
  let selectedConnectionId: string | undefined;
  let selectedComponentId: string | undefined;
  let nextEntitySerial = 1;
  let blueprintDraftDirty = false;
  let partDraftDirty = false;

  function nextSandboxEntityId(prefix = 'sandbox-entity'): string {
    const current = new Set(world.listEntities().map((entity) => entity.id));
    let candidate = `${prefix}-${nextEntitySerial++}`;
    while (current.has(candidate)) candidate = `${prefix}-${nextEntitySerial++}`;
    return candidate;
  }

  const time = fieldset(root, 'World time');
  const pauseButton = button(time, '', () => run('World pause state updated', () => { world.paused = !world.paused; }));
  button(time, 'Step tick', () => run('Advanced one fixed tick', () => world.stepOnce()));
  const timeScale = labeled(time, 'Time scale', selectInput());
  for (const value of [0.1, 0.25, 0.5, 1, 2]) addOption(timeScale, String(value), `${value}×`, value === 1);
  timeScale.addEventListener('change', () => run(`Time scale set to ${timeScale.value}×`, () => world.setTimeScale(parseNumber(timeScale.value, 'Time scale'))));

  const spawn = fieldset(root, 'Spawn Blueprint');
  const blueprintChoice = labeled(spawn, 'Catalog', selectInput());
  for (const entry of catalog) addOption(blueprintChoice, entry.id, entry.label ?? entry.id);
  const entityIdInput = labeled(spawn, 'Entity id', textInput('sandbox-entity-1'));
  const spawnOrigin = document.createElement('div');
  spawnOrigin.className = 'god-sandbox-row';
  const spawnX = labeled(spawnOrigin, 'X', numberInput('0'));
  const spawnY = labeled(spawnOrigin, 'Y', numberInput('0'));
  const spawnZ = labeled(spawnOrigin, 'Z', numberInput('0'));
  spawn.append(spawnOrigin);
  button(spawn, 'Spawn', () => run('Blueprint spawned', () => {
    const entry = catalog.find((candidate) => candidate.id === blueprintChoice.value);
    if (!entry) throw new Error('Choose a Blueprint catalog entry');
    const entityId = entityIdInput.value.trim();
    if (!entityId) throw new Error('Entity id is required');
    const entity: Entity = { id: entityId, blueprint: blueprintFromEntry(entry) };
    const spawnOptions: SpawnOptions = {
      ...entry.spawnOptions,
      ...options.spawnOptions,
      origin: {
        x: parseNumber(spawnX.value, 'Spawn X'),
        y: parseNumber(spawnY.value, 'Spawn Y'),
        z: parseNumber(spawnZ.value, 'Spawn Z'),
      },
    };
    construction.spawn(entity, spawnOptions);
    selectedEntityId = entity.id;
    entityIdInput.value = nextSandboxEntityId();
  }, true));

  const selection = fieldset(root, 'Inspect structure');
  const entityChoice = labeled(selection, 'Entity', selectInput());
  const entitySummary = document.createElement('div');
  entitySummary.className = 'god-sandbox-summary';
  selection.append(entitySummary);
  const componentChoice = labeled(selection, 'Component', selectInput());
  const partChoice = labeled(selection, 'Part', selectInput());
  const connectionChoice = labeled(selection, 'Connection', selectInput());
  const structureSummary = document.createElement('div');
  structureSummary.className = 'god-sandbox-summary';
  selection.append(structureSummary);

  const partEditor = fieldset(root, 'Part edit');
  const partMaterial = labeled(partEditor, 'Material id', textInput());
  const partMass = labeled(partEditor, 'Mass', numberInput());
  const partGeometryKind = labeled(partEditor, 'Geometry', selectInput());
  for (const kind of ['box', 'sphere', 'capsule', 'convex'] as const) addOption(partGeometryKind, kind, kind);
  const geometryDimensions = document.createElement('div');
  geometryDimensions.className = 'god-sandbox-row';
  const geometryA = labeled(geometryDimensions, 'A', numberInput());
  const geometryB = labeled(geometryDimensions, 'B', numberInput());
  const geometryC = labeled(geometryDimensions, 'C', numberInput());
  partEditor.append(geometryDimensions);
  const convexPoints = labeled(partEditor, 'Convex points', textInput());
  const partJson = document.createElement('textarea');
  partJson.setAttribute('aria-label', 'Selected Part JSON');
  partEditor.append(partJson);
  const partActions = document.createElement('div');
  partActions.className = 'god-sandbox-actions';
  partEditor.append(partActions);
  const applyPartButton = button(partActions, 'Apply quick edit', () => run('Part updated', () => {
    const entityId = requireEntity();
    const part = requirePart();
    const geometry = selectedGeometry(part, partGeometryKind.value as Geometry['kind'], geometryA.value, geometryB.value, geometryC.value, convexPoints.value);
    construction.updatePart(entityId, {
      ...part,
      materialId: partMaterial.value.trim(),
      mass: partMass.value.trim() === '' ? undefined : parsePositive(partMass.value, 'Mass'),
      geometry,
    });
  }, true));
  button(partActions, 'Apply Part JSON', () => run('Part JSON applied', () => {
    const entityId = requireEntity();
    const parsed: unknown = JSON.parse(partJson.value);
    if (!parsed || typeof parsed !== 'object') throw new Error('Part JSON must be an object');
    construction.updatePart(entityId, parsed as Part);
  }, true));
  const addPartButton = button(partActions, 'Add box Part', () => run('Part added', () => {
    const inspection = requireInspection();
    const materialId = inspection.blueprint.materials[0]?.id;
    if (!materialId) throw new Error('Blueprint has no Material to use for a new Part');
    construction.addPart(requireEntity(), {
      id: makeId('part', inspection.blueprint.parts.map((part) => part.id)),
      materialId,
      geometry: { kind: 'box', halfExtents: { x: 0.3, y: 0.3, z: 0.3 } },
      pose: IDENTITY_POSE,
      mass: 1,
    });
  }, true));
  const removePartButton = button(partActions, 'Remove Part', () => run('Part removed', () => construction.removePart(requireEntity(), requirePart().id), true));

  const connections = fieldset(root, 'Connections and structure');
  const connectionEndpoints = document.createElement('div');
  connectionEndpoints.className = 'god-sandbox-row';
  const connectionFrom = labeled(connectionEndpoints, 'From', selectInput());
  const connectionTo = labeled(connectionEndpoints, 'To', selectInput());
  button(connectionEndpoints, 'Add rigid', () => run('Rigid connection added', () => {
    const inspection = requireInspection();
    const from = inspection.blueprint.parts.find((part) => part.id === connectionFrom.value);
    const to = inspection.blueprint.parts.find((part) => part.id === connectionTo.value);
    if (!from || !to) throw new Error('Choose two Parts for a connection');
    if (from.id === to.id) throw new Error('A connection needs two different Parts');
    construction.addConnection(requireEntity(), buildRigidConnection(
      makeId('connection', inspection.blueprint.connections.map((connection) => connection.id)), from, to,
    ));
  }, true));
  connections.append(connectionEndpoints);
  const connectionActions = document.createElement('div');
  connectionActions.className = 'god-sandbox-actions';
  connections.append(connectionActions);
  const detachButton = button(connectionActions, 'Detach', () => run('Connection detached', () => construction.detach(requireEntity(), requireConnectionId()), true));
  const reattachButton = button(connectionActions, 'Reattach', () => run('Connection reattached', () => construction.reattach(requireEntity(), requireConnectionId()), true));
  const removeConnectionButton = button(connectionActions, 'Remove connection', () => run('Connection removed', () => construction.removeConnection(requireEntity(), requireConnectionId()), true));
  const repairConnectionButton = button(connectionActions, 'Repair connection', () => run('Connection repaired', () => construction.repair(requireEntity(), requireConnectionId())));
  button(connectionActions, 'Repair all', () => run('Structure repaired', () => construction.repair(requireEntity())));
  const connectionInspection = document.createElement('pre');
  connectionInspection.className = 'god-sandbox-summary';
  connections.append(connectionInspection);

  const impact = fieldset(root, 'Impact and repair');
  const impulseRow = document.createElement('div');
  impulseRow.className = 'god-sandbox-row';
  const impulseX = labeled(impulseRow, 'Impulse X', numberInput('0'));
  const impulseY = labeled(impulseRow, 'Y', numberInput('0'));
  const impulseZ = labeled(impulseRow, 'Z', numberInput('1'));
  impact.append(impulseRow);
  const impactButton = button(impact, 'Apply impact to selected Part', () => run('Impact applied', () => {
    const componentId = selectedValue(componentChoice);
    if (!componentId) throw new Error('Choose a structural Component');
    const partId = selectedValue(partChoice);
    if (!partId) throw new Error('Choose a Part');
    construction.applyImpact(componentId, partId, {
      x: parseNumber(impulseX.value, 'Impulse X'),
      y: parseNumber(impulseY.value, 'Impulse Y'),
      z: parseNumber(impulseZ.value, 'Impulse Z'),
    });
  }));
  const repairPartButton = button(impact, 'Repair selected Part', () => run('Part repaired', () => construction.repair(requireEntity(), requirePart().id)));

  const attachments = fieldset(root, 'Actuators and sensors');
  const actuatorChoice = labeled(attachments, 'Actuator', selectInput());
  const actuatorActions = document.createElement('div');
  actuatorActions.className = 'god-sandbox-actions';
  attachments.append(actuatorActions);
  const addActuatorButton = button(actuatorActions, 'Add actuator to Connection', () => run('Actuator added', () => {
    const inspection = requireInspection();
    const connectionId = requireConnectionId();
    const connection = inspection.blueprint.connections.find((entry) => entry.id === connectionId);
    if (!connection || (connection.kind !== 'revolute' && connection.kind !== 'prismatic')) {
      throw new Error('Actuators require a revolute or prismatic Connection');
    }
    construction.addActuator(requireEntity(), {
      id: makeId('actuator', (inspection.blueprint.actuators ?? []).map((actuator) => actuator.id)),
      connectionId,
      maxOutput: 10,
      responseTimeSeconds: 0.1,
    });
  }, true));
  const removeActuatorButton = button(actuatorActions, 'Remove actuator', () => run('Actuator removed', () => {
    const actuatorId = selectedValue(actuatorChoice);
    if (!actuatorId) throw new Error('Choose an Actuator');
    construction.removeActuator(requireEntity(), actuatorId);
  }, true));
  const sensorChoice = labeled(attachments, 'Sensor', selectInput());
  const sensorActions = document.createElement('div');
  sensorActions.className = 'god-sandbox-actions';
  attachments.append(sensorActions);
  const addSensorButton = button(sensorActions, 'Add range sensor to Part', () => run('Sensor added', () => {
    const inspection = requireInspection();
    const partId = requirePart().id;
    construction.addSensor(requireEntity(), {
      id: makeId('sensor', (inspection.blueprint.sensors ?? []).map((sensor) => sensor.id)),
      kind: 'range',
      partId,
      localPose: IDENTITY_POSE,
      forward: { x: 1, y: 0, z: 0 },
      updatePeriodTicks: 1,
      noise: { standardDeviation: 0 },
      latencyTicks: 0,
      range: 5,
      fieldOfViewRadians: Math.PI / 3,
      resolution: 5,
    });
  }, true));
  const removeSensorButton = button(sensorActions, 'Remove sensor', () => run('Sensor removed', () => {
    const sensorId = selectedValue(sensorChoice);
    if (!sensorId) throw new Error('Choose a Sensor');
    construction.removeSensor(requireEntity(), sensorId);
  }, true));

  const blueprintEditor = fieldset(root, 'Blueprint JSON');
  const blueprintJson = document.createElement('textarea');
  blueprintJson.setAttribute('aria-label', 'Blueprint JSON');
  blueprintEditor.append(blueprintJson);
  const blueprintActions = document.createElement('div');
  blueprintActions.className = 'god-sandbox-actions';
  blueprintEditor.append(blueprintActions);
  button(blueprintActions, 'Validate JSON', () => {
    try {
      const blueprint = parseBlueprintJson();
      const errors = construction.validate(blueprint);
      validationErrors.textContent = errors.join('\n');
      validationErrors.hidden = errors.length === 0;
      setStatus(errors.length ? errors.join('\n') : 'Blueprint is valid', errors.length > 0);
    } catch (error) {
      validationErrors.textContent = formatError(error);
      validationErrors.hidden = false;
      setStatus(formatError(error), true);
    }
  });
  button(blueprintActions, 'Save selected', () => run('Blueprint saved to editor', () => {
    blueprintJson.value = construction.saveBlueprint(requireEntity());
  }, true));
  button(blueprintActions, 'Apply to selected', () => run('Blueprint applied', () => {
    construction.replaceBlueprint(requireEntity(), parseBlueprintJson());
  }, true));
  button(blueprintActions, 'Load as new Entity', () => run('Blueprint loaded as new Entity', () => {
    const blueprint = parseBlueprintJson();
    const entity: Entity = {
      id: nextSandboxEntityId('sandbox-import'),
      blueprint,
    };
    construction.spawn(entity, options.spawnOptions);
    selectedEntityId = entity.id;
  }, true));
  const validationErrors = document.createElement('pre');
  validationErrors.className = 'god-sandbox-errors';
  validationErrors.hidden = true;
  blueprintEditor.append(validationErrors);

  blueprintJson.addEventListener('input', () => { blueprintDraftDirty = true; });
  for (const control of [partMaterial, partMass, partGeometryKind, geometryA, geometryB, geometryC, convexPoints, partJson]) {
    control.addEventListener('input', () => { partDraftDirty = true; });
  }
  partGeometryKind.addEventListener('change', () => { partDraftDirty = true; });

  const inspectionDetails = document.createElement('details');
  inspectionDetails.className = 'god-sandbox-collapsed';
  const inspectionSummary = document.createElement('summary');
  inspectionSummary.textContent = 'Inspection JSON';
  const inspectionJson = document.createElement('pre');
  inspectionDetails.append(inspectionSummary, inspectionJson);
  root.append(inspectionDetails);

  function setStatus(message: string, error = false): void {
    status.textContent = message;
    status.dataset.error = error ? 'true' : 'false';
  }

  function requireEntity(): string {
    if (!selectedEntityId) throw new Error('Choose an Entity');
    return selectedEntityId;
  }

  function requireInspection(): GodSandboxInspection {
    return construction.inspect(requireEntity());
  }

  function requirePart(): Part {
    const part = requireInspection().blueprint.parts.find((entry) => entry.id === selectedPartId);
    if (!part) throw new Error('Choose a Part');
    return part;
  }

  function requireConnectionId(): string {
    if (!selectedConnectionId) throw new Error('Choose a Connection');
    return selectedConnectionId;
  }

  function parseBlueprintJson(): Blueprint {
    const parsed: unknown = JSON.parse(blueprintJson.value);
    if (!parsed || typeof parsed !== 'object') throw new Error('Blueprint JSON must be an object');
    const blueprint = parsed as Blueprint;
    const errors = construction.validate(blueprint);
    if (errors.length) throw new Error(errors.join('; '));
    return blueprint;
  }

  function run(success: string, action: () => void, resetDrafts = false): void {
    try {
      action();
      if (resetDrafts) {
        blueprintDraftDirty = false;
        partDraftDirty = false;
      }
      setStatus(success);
      onChanged();
      refresh();
    } catch (error) {
      setStatus(formatError(error), true);
      refresh();
    }
  }

  function renderEntityOptions(): void {
    const entities = world.listEntities();
    if (!entities.some((entity) => entity.id === selectedEntityId)) selectedEntityId = entities[0]?.id;
    entityChoice.textContent = '';
    if (entities.length === 0) addOption(entityChoice, '', 'No entities');
    for (const entity of entities) addOption(entityChoice, entity.id, `${entity.id} · ${entity.blueprintId}`, entity.id === selectedEntityId);
  }

  function renderInspection(): void {
    let inspection: GodSandboxInspection | undefined;
    if (selectedEntityId) {
      try { inspection = construction.inspect(selectedEntityId); }
      catch { inspection = undefined; }
    }
    if (!inspection) {
      selectedPartId = undefined;
      selectedConnectionId = undefined;
      selectedComponentId = undefined;
      entitySummary.textContent = 'Select an Entity to inspect its structure.';
      structureSummary.textContent = '';
      partJson.value = '';
      if (!blueprintDraftDirty) blueprintJson.value = '';
      inspectionJson.textContent = '';
      connectionInspection.textContent = '';
      setDisabled(true);
      return;
    }

    const { blueprint, entity, components } = inspection;
    if (!blueprint.parts.some((part) => part.id === selectedPartId)) selectedPartId = blueprint.parts[0]?.id;
    const detached = construction.listDetachedConnections(entity.id);
    const allConnections = [
      ...blueprint.connections.map((connection) => ({ connection, detached: false })),
      ...detached.map((connection) => ({ connection, detached: true })),
    ];
    if (!allConnections.some(({ connection }) => connection.id === selectedConnectionId)) selectedConnectionId = allConnections[0]?.connection.id;
    const partOwner = selectedPartId ? components.find((component) => component.partIds.includes(selectedPartId!)) : undefined;
    if (partOwner) selectedComponentId = partOwner.id;
    else if (!components.some((component) => component.id === selectedComponentId)) selectedComponentId = components[0]?.id;
    entitySummary.textContent = `${entity.id} · ${blueprint.parts.length} Parts · ${blueprint.connections.length} Connections · ${blueprint.actuators?.length ?? 0} Actuators · ${blueprint.sensors?.length ?? 0} Sensors`;
    structureSummary.textContent = `${renderDamageSummary(inspection.damage)}\n${components.length} structural Component${components.length === 1 ? '' : 's'}${detached.length ? ` · ${detached.length} detached Connection${detached.length === 1 ? '' : 's'}` : ''}`;

    componentChoice.textContent = '';
    if (components.length === 0) addOption(componentChoice, '', 'No components');
    for (const component of components) addOption(componentChoice, component.id, `${component.id} · ${component.partIds.join(', ')}`, component.id === selectedComponentId);
    partChoice.textContent = '';
    for (const part of blueprint.parts) addOption(partChoice, part.id, part.id, part.id === selectedPartId);
    connectionChoice.textContent = '';
    if (allConnections.length === 0) addOption(connectionChoice, '', 'No connections');
    for (const { connection, detached: isDetached } of allConnections) {
      addOption(connectionChoice, connection.id, `${connection.id}${isDetached ? ' · detached' : ''}`, connection.id === selectedConnectionId);
    }
    connectionFrom.textContent = '';
    connectionTo.textContent = '';
    for (const part of blueprint.parts) {
      addOption(connectionFrom, part.id, part.id, part.id === blueprint.parts[0]?.id);
      addOption(connectionTo, part.id, part.id, part.id === blueprint.parts[1]?.id);
    }
    actuatorChoice.textContent = '';
    if (!(blueprint.actuators?.length)) addOption(actuatorChoice, '', 'No actuators');
    for (const actuator of blueprint.actuators ?? []) addOption(actuatorChoice, actuator.id, `${actuator.id} → ${actuator.connectionId}`);
    sensorChoice.textContent = '';
    if (!(blueprint.sensors?.length)) addOption(sensorChoice, '', 'No sensors');
    for (const sensor of blueprint.sensors ?? []) addOption(sensorChoice, sensor.id, `${sensor.id} → ${sensor.partId}`);
    if (!blueprintDraftDirty) blueprintJson.value = JSON.stringify(blueprint, null, 2);
    inspectionJson.textContent = JSON.stringify(inspection, null, 2);
    if (!partDraftDirty) renderPartEditor(blueprint);
    const selectedConnection = allConnections.find(({ connection }) => connection.id === selectedConnectionId);
    connectionInspection.textContent = selectedConnection
      ? JSON.stringify({ ...selectedConnection.connection, detached: selectedConnection.detached,
        damage: inspection.damage.connections[selectedConnection.connection.id]?.damage ?? null }, null, 2)
      : 'Select a Connection to inspect its anchors and condition.';
    detachButton.disabled = !selectedConnection || selectedConnection.detached;
    reattachButton.disabled = !selectedConnection || !selectedConnection.detached;
    removeConnectionButton.disabled = !selectedConnection || selectedConnection.detached;
    repairConnectionButton.disabled = !selectedConnection || selectedConnection.detached;
    addActuatorButton.disabled = !selectedConnection || selectedConnection.detached;
    repairPartButton.disabled = !selectedPartId;
    impactButton.disabled = !selectedComponentId || !selectedPartId
      || !components.some((component) => component.id === selectedComponentId && component.partIds.includes(selectedPartId!));
    applyPartButton.disabled = !selectedPartId;
    addPartButton.disabled = false;
    removePartButton.disabled = !selectedPartId;
    addSensorButton.disabled = !selectedPartId;
    removeActuatorButton.disabled = !(blueprint.actuators?.length);
    removeSensorButton.disabled = !(blueprint.sensors?.length);
    setDisabled(false);
  }

  function renderPartEditor(blueprint: Blueprint): void {
    const part = blueprint.parts.find((entry) => entry.id === selectedPartId);
    if (!part) {
      partMaterial.value = '';
      partMass.value = '';
      partJson.value = '';
      convexPoints.value = '';
      return;
    }
    partMaterial.value = part.materialId;
    partMass.value = part.mass === undefined ? '' : String(part.mass);
    partGeometryKind.value = part.geometry.kind;
    switch (part.geometry.kind) {
      case 'box':
        geometryA.value = String(part.geometry.halfExtents.x);
        geometryB.value = String(part.geometry.halfExtents.y);
        geometryC.value = String(part.geometry.halfExtents.z);
        convexPoints.value = '';
        break;
      case 'sphere':
        geometryA.value = String(part.geometry.radius);
        geometryB.value = '';
        geometryC.value = '';
        convexPoints.value = '';
        break;
      case 'capsule':
        geometryA.value = String(part.geometry.radius);
        geometryB.value = String(part.geometry.halfHeight);
        geometryC.value = '';
        convexPoints.value = '';
        break;
      case 'convex':
        geometryA.value = '';
        geometryB.value = '';
        geometryC.value = '';
        convexPoints.value = JSON.stringify(part.geometry.points);
        break;
    }
    partJson.value = JSON.stringify(part, null, 2);
  }

  function setDisabled(disabled: boolean): void {
    for (const control of [
      partMaterial, partMass, partGeometryKind, geometryA, geometryB, geometryC, convexPoints, partJson,
      connectionFrom, connectionTo, actuatorChoice, sensorChoice,
    ]) control.disabled = disabled;
  }

  entityChoice.addEventListener('change', () => {
      selectedEntityId = selectedValue(entityChoice);
      selectedPartId = undefined;
      selectedConnectionId = undefined;
      selectedComponentId = undefined;
      blueprintDraftDirty = false;
      partDraftDirty = false;
      refresh();
  });
  partChoice.addEventListener('change', () => {
    selectedPartId = selectedValue(partChoice);
    partDraftDirty = false;
    renderInspection();
  });
  connectionChoice.addEventListener('change', () => { selectedConnectionId = selectedValue(connectionChoice); renderInspection(); });
  componentChoice.addEventListener('change', () => { selectedComponentId = selectedValue(componentChoice); renderInspection(); });

  function refresh(): void {
    pauseButton.textContent = world.paused ? 'Resume' : 'Pause';
    renderEntityOptions();
    renderInspection();
  }

  refresh();
  return {
    element: root,
    refresh,
    destroy: () => root.remove(),
  };
}
