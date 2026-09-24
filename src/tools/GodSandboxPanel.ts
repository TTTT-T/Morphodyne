import './GodSandboxPanel.css';

import type { EnergySourceSpec, StructuralActuator } from '../core/actuation';
import type {
  Blueprint,
  Connection,
  Entity,
  Geometry,
  Material,
  Part,
  Sensor,
  Vector3,
} from '../core/model';
import type { StructuralDamageState } from '../core/damage';
import type { ConnectionLoad } from '../physics/PhysicsAdapter';
import type { SpawnOptions, StructuralComponentView, RuntimeEntityView, WorldRuntime } from '../simulation/WorldRuntime';
import type { ConstructionRuntime } from '../simulation/ConstructionRuntime';
import type { EnergyState } from '../simulation/EnergyRuntime';
import { ManualControlSource } from './ManualControlSource';
import { SANDBOX_CATALOG } from './sandboxTemplates';
import { createSandboxPayloadBlueprint } from './sandboxBlueprintCatalog';

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
  readonly onSelectionChanged?: (entityId?: string, partId?: string) => void;
}

export interface GodSandboxWorld {
  paused: boolean;
  stepOnce(): void;
  setTimeScale(value: number): void;
  listEntities(): readonly RuntimeEntityView[];
  removeEntity?(entityId: string): void;
  inspectEnergy?(entityId: string): EnergyState | undefined;
  readPartPose?(componentId: string, partId: string): { readonly position: Vector3 };
  readPartContacts?(entityId: string, partId: string): readonly unknown[];
  readPartVelocity?(entityId: string, partId: string): Vector3 | undefined;
  readConnectionLoad?(entityId: string, connectionId: string): ConnectionLoad | undefined;
  readonly environment?: {
    setWeather(weather: 'clear' | 'rain'): void;
    setTimeOfDay(hour: number): void;
    readonly state?: { readonly weather?: 'clear' | 'rain'; readonly timeOfDay?: number };
  };
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
  addActuator(entityId: string, actuator: StructuralActuator): void;
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

const DEFAULT_CATALOG: readonly GodSandboxCatalogEntry[] = SANDBOX_CATALOG;

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SyntaxError) return 'JSON 格式有误，请检查括号、逗号和引号。';
  if (message.startsWith('Invalid Blueprint: ')) {
    return message.slice('Invalid Blueprint: '.length).split('; ').map(localizeValidationError).join('；');
  }
  if (message.startsWith('Blueprint must contain')) return '蓝图需要材料、部件和连接三个数组（materials、parts、connections）。';
  if (/[\u3400-\u9fff]/.test(message)) return message;
  return /[A-Za-z]{2,}/.test(message) ? '操作未完成，请检查当前选择和输入内容。' : message;
}

function localizeValidationError(message: string): string {
  const prefixes: Readonly<Record<string, string>> = {
    'Blueprint id is required': '蓝图编号不能为空',
    'Blueprint must contain materials, parts, and connections arrays': '蓝图需要材料、部件和连接三个数组（materials、parts、connections）',
    'A runtime Entity requires at least one Part': '物体至少需要一个部件',
    'Invalid or duplicate material id': '材料编号为空或重复',
    'Invalid density': '材料密度无效',
    'Invalid friction': '材料摩擦系数无效',
    'Invalid restitution': '材料弹性系数无效',
    'Invalid or duplicate part id': '部件编号为空或重复',
    'Unknown material': '部件引用了不存在的材料',
    'Invalid pose': '部件姿态无效',
    'Invalid mass': '部件质量无效',
    'Invalid or duplicate connection id': '连接编号为空或重复',
    'Unknown connection endpoint': '连接引用了不存在的部件',
    'Self connection': '连接不能指向同一个部件',
    'Misaligned connection anchors': '连接锚点未对齐',
    'Invalid connection anchors': '连接锚点无效',
    'Invalid connection kind': '连接类型无效',
    'Invalid connection axis': '连接轴无效',
    'Invalid connection limits': '连接范围无效',
    'Invalid or duplicate actuator id': '执行器编号为空或重复',
    'Unknown actuator connection': '执行器引用了不存在的连接',
    'Actuator requires a revolute or prismatic connection': '执行器需要旋转或滑动连接',
    'Invalid or duplicate sensor id': '传感器编号为空或重复',
    'Unknown sensor part': '传感器引用了不存在的部件',
  };
  const colon = message.indexOf(': ');
  const key = colon < 0 ? message : message.slice(0, colon);
  return `${prefixes[key] ?? '蓝图结构有误'}${colon < 0 ? '' : `：${message.slice(colon + 2)}`}`;
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
  if (!Number.isFinite(parsed)) throw new Error(`${label}必须是有效数字`);
  return parsed;
}

function parsePositive(value: string, label: string): number {
  const parsed = parseNumber(value, label);
  if (parsed <= 0) throw new Error(`${label}必须大于零`);
  return parsed;
}

function readVector(inputs: readonly HTMLInputElement[], label: string): Vector3 {
  return { x: parseNumber(inputs[0].value, `${label} X`), y: parseNumber(inputs[1].value, `${label} Y`), z: parseNumber(inputs[2].value, `${label} Z`) };
}

function vectorInputs(parent: HTMLElement, label: string, initial: Vector3 = { x: 0, y: 0, z: 0 }): readonly HTMLInputElement[] {
  const row = document.createElement('div');
  row.className = 'god-sandbox-row';
  const inputs = (['x', 'y', 'z'] as const).map((axis) => labeled(row, `${label} ${axis.toUpperCase()}`, numberInput(String(initial[axis]))));
  parent.append(row);
  return inputs;
}

function setVector(inputs: readonly HTMLInputElement[], value: Vector3): void {
  inputs[0].value = String(value.x);
  inputs[1].value = String(value.y);
  inputs[2].value = String(value.z);
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

function hint(parent: HTMLElement, message: string): void {
  const element = document.createElement('p');
  element.className = 'god-sandbox-hint';
  element.textContent = message;
  parent.append(element);
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
      return { kind, halfExtents: { x: parsePositive(a, '半长 X'), y: parsePositive(b, '半长 Y'), z: parsePositive(c, '半长 Z') } };
    case 'sphere':
      return { kind, radius: parsePositive(a, '半径') };
    case 'capsule':
      return { kind, radius: parsePositive(a, '半径'), halfHeight: parsePositive(b, '半高') };
    case 'convex': {
      if (part.geometry.kind === 'convex' && pointsJson.trim() === '') return part.geometry;
      const points: unknown = JSON.parse(pointsJson);
      if (!Array.isArray(points)) throw new Error('凸形顶点必须是 JSON 数组');
      return { kind, points: points as readonly Vector3[] };
    }
    default:
      throw new Error(`不支持的形状：${String(kind)}`);
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

function friendlyBlueprintName(id: string): string {
  if (id === 'sandbox-joint-mechanism') return '基础关节机构';
  if (id === 'sandbox-tension-mechanism') return '基础拉力机构';
  if (id === 'sandbox-gripper') return '基础夹持机构';
  if (id === 'sandbox-passive-payload') return '独立方块';
  if (id.includes('passive-object')) return '箱子 / 被动物体';
  if (id.includes('actuated-machine')) return '简单机械结构';
  if (id.includes('sensor-platform')) return '传感器平台';
  if (id.includes('active-body')) return 'Agent';
  return '物体';
}

function renderDamageSummary(damage: StructuralDamageState): string {
  const partStates = Object.values(damage.parts);
  const connectionStates = Object.values(damage.connections);
  const damagedParts = partStates.filter((entry) => entry.damage.state !== 'intact').length;
  const damagedConnections = connectionStates.filter((entry) => entry.damage.state !== 'intact').length;
  return `受损部件 ${damagedParts}/${partStates.length} · 受损连接 ${damagedConnections}/${connectionStates.length}`;
}

function damageLabel(state: string | undefined): string {
  return ({ intact: '完好', degraded: '受损', fractured: '断裂', separated: '已分离' } as Record<string, string>)[state ?? ''] ?? '无读数';
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
  root.setAttribute('aria-label', '上帝沙盒');
  host.append(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Morphodyne 世界沙盒';
  root.append(heading);
  const status = document.createElement('div');
  status.className = 'god-sandbox-status';
  status.setAttribute('role', 'status');
  root.append(status);
  const modeSummary = document.createElement('strong');
  root.append(modeSummary);

  let selectedEntityId: string | undefined;
  let selectedPartId: string | undefined;
  let selectedConnectionId: string | undefined;
  let selectedActuatorId: string | undefined;
  let selectedComponentId: string | undefined;
  let nextEntitySerial = 1;
  let blueprintDraftDirty = false;
  let partDraftDirty = false;
  let connectionDraftDirty = false;
  let actuatorDraftDirty = false;
  let materialDraftDirty = false;
  let controlRenderKey = '';
  const manualSources = new Map<string, ManualControlSource>();
  const templateIds = new Map<string, string>();
  const companionIds = new Map<string, string>();
  function editing(): boolean { return world.paused; }
  function requireEdit(): void { if (!editing()) throw new Error('请先暂停，进入编辑模式'); }

  function nextSandboxEntityId(prefix = 'sandbox-entity'): string {
    const current = new Set(world.listEntities().map((entity) => entity.id));
    let candidate = `${prefix}-${nextEntitySerial++}`;
    while (current.has(candidate)) candidate = `${prefix}-${nextEntitySerial++}`;
    return candidate;
  }

  const worldGroup = fieldset(root, '世界');
  hint(worldGroup, '当前世界中的物体会显示在下方列表。');
  const createGroup = fieldset(root, '创建');
  const editGroup = fieldset(root, '编辑当前物体');
  const impactGroup = fieldset(root, '作用与破坏修复');
  const timeGroup = fieldset(root, '时间控制');
  const environmentGroup = fieldset(root, '环境');
  const advanced = document.createElement('details');
  advanced.className = 'god-sandbox-advanced';
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = '高级调试';
  root.append(advanced);
  advanced.append(advancedSummary);

  const time = fieldset(timeGroup, '时间控制');
  const pauseButton = button(time, '', () => run('运行状态已更新', () => { world.paused = !world.paused; }));
  const stepButton = button(time, '单步运行', () => run('已前进一步', () => world.stepOnce()));
  const timeScale = labeled(time, '时间速度', selectInput());
  for (const value of [0.1, 0.25, 0.5, 1, 2]) addOption(timeScale, String(value), `${value}×`, value === 1);
  timeScale.addEventListener('change', () => run(`时间速度已设为 ${timeScale.value} 倍`, () => world.setTimeScale(parseNumber(timeScale.value, '时间速度'))));
  hint(time, '暂停后可单步观察；时间速度会影响模拟推进快慢。');

  const environmentApi = world.environment;
  const weatherActions = document.createElement('div');
  weatherActions.className = 'god-sandbox-actions';
  environmentGroup.append(weatherActions);
  const clearWeather = button(weatherActions, '晴天', () => run('天气已切换为晴天', () => { if (!environmentApi) throw new Error('当前世界不支持环境控制'); environmentApi.setWeather('clear'); }));
  const rainWeather = button(weatherActions, '下雨', () => run('天气已切换为下雨', () => { if (!environmentApi) throw new Error('当前世界不支持环境控制'); environmentApi.setWeather('rain'); }));
  const dayButton = button(weatherActions, '白天', () => run('时间已切换为白天', () => { if (!environmentApi) throw new Error('当前世界不支持环境控制'); environmentApi.setTimeOfDay(12); }));
  const nightButton = button(weatherActions, '夜晚', () => run('时间已切换为夜晚', () => { if (!environmentApi) throw new Error('当前世界不支持环境控制'); environmentApi.setTimeOfDay(0); }));
  if (!environmentApi) { clearWeather.disabled = true; rainWeather.disabled = true; dayButton.disabled = true; nightButton.disabled = true; hint(environmentGroup, '此测试世界未提供环境控制接口。'); }

  const spawn = fieldset(createGroup, '生成物体');
  const blueprintChoice = labeled(spawn, '基础模板', selectInput());
  hint(spawn, '选择结构，修改执行器控制，再观察物理结果。');
  for (const entry of catalog) addOption(blueprintChoice, entry.id, entry.label ?? entry.id);
  const entityIdInput = labeled(advanced, '物体内部编号（高级）', textInput(nextSandboxEntityId()));
  const spawnOrigin = document.createElement('div');
  spawnOrigin.className = 'god-sandbox-row';
  const spawnX = labeled(spawnOrigin, 'X', numberInput('0'));
  const spawnY = labeled(spawnOrigin, 'Y', numberInput('0'));
  const spawnZ = labeled(spawnOrigin, 'Z', numberInput('0'));
  spawn.append(spawnOrigin);
  const capacityInput = labeled(spawn, '能量容量 J', numberInput('1000'));
  const powerInput = labeled(spawn, '功率上限 W', numberInput('150'));
  const efficiencyInput = labeled(spawn, '效率（0–1）', numberInput('0.8', '0.05'));
  hint(spawn, '能量配置在生成或重置时生效；运行中不会补充能量。');
  function spawnTemplate(templateId = blueprintChoice.value): void {
    requireEdit();
    const entry = catalog.find((candidate) => candidate.id === templateId);
    if (!entry) throw new Error('请选择要生成的物体类型');
    const blueprint = blueprintFromEntry(entry);
    const entityId = nextSandboxEntityId();
    const entity: Entity = { id: entityId, blueprint };
    const manual = new ManualControlSource();
    const energy: EnergySourceSpec = {
      capacityJ: parsePositive(capacityInput.value, '能量容量'),
      maxPowerWatts: parsePositive(powerInput.value, '功率上限'),
      efficiency: parsePositive(efficiencyInput.value, '效率'),
    };
    if (energy.efficiency > 1) throw new Error('效率不能大于 1');
    const spawnOptions: SpawnOptions = {
      ...entry.spawnOptions,
      ...options.spawnOptions,
      ...(blueprint.actuators?.length ? { energy, control: manual.control } : {}),
      origin: {
        x: parseNumber(spawnX.value, '生成位置 X'),
        y: parseNumber(spawnY.value, '生成位置 Y'),
        z: parseNumber(spawnZ.value, '生成位置 Z'),
      },
    };
    construction.spawn(entity, spawnOptions);
    if (templateId === 'gripper') {
      const payloadId = nextSandboxEntityId('sandbox-payload');
      construction.spawn({ id: payloadId, blueprint: createSandboxPayloadBlueprint() }, { origin: spawnOptions.origin });
      companionIds.set(entity.id, payloadId);
    }
    manualSources.set(entity.id, manual);
    templateIds.set(entity.id, templateId);
    selectedEntityId = entity.id;
    entityIdInput.value = nextSandboxEntityId();
  }
  button(spawn, '生成模板', () => run('已生成结构', () => spawnTemplate(), true));
  button(spawn, '重置当前模板', () => run('已重置当前模板', () => {
    const selectedId = requireEntity();
    const id = templateIds.has(selectedId) ? selectedId
      : [...companionIds].find(([, companionId]) => companionId === selectedId)?.[0] ?? selectedId;
    const templateId = templateIds.get(id);
    if (!templateId || !world.removeEntity) throw new Error('当前物体不是可重置的模板');
    requireEdit();
    const companionId = companionIds.get(id);
    if (companionId && world.listEntities().some((entity) => entity.id === companionId)) world.removeEntity(companionId);
    world.removeEntity(id);
    manualSources.delete(id);
    templateIds.delete(id);
    companionIds.delete(id);
    spawnTemplate(templateId);
  }, true));
  button(spawn, '重新生成场景', () => run('场景已重新生成', () => {
    if (!world.removeEntity) throw new Error('当前世界不支持重建场景');
    requireEdit();
    for (const entity of world.listEntities()) world.removeEntity(entity.id);
    manualSources.clear();
    templateIds.clear();
    companionIds.clear();
    spawnTemplate();
  }, true));

  const selection = fieldset(worldGroup, '当前世界与物体');
  hint(selection, '选择物体后，可在下方编辑结构或施加作用。');
  const entityChoice = labeled(selection, '物体', selectInput());
  const entitySummary = document.createElement('div');
  entitySummary.className = 'god-sandbox-summary';
  selection.append(entitySummary);
  const componentChoice = labeled(selection, '结构组件', selectInput());
  const partChoice = labeled(selection, '部件', selectInput());
  const connectionChoice = labeled(selection, '连接', selectInput());
  const structureSummary = document.createElement('div');
  structureSummary.className = 'god-sandbox-summary';
  selection.append(structureSummary);
  const partPosition = document.createElement('pre');
  partPosition.className = 'god-sandbox-summary';
  selection.append(partPosition);

  const partEditor = fieldset(editGroup, '编辑部件');
  hint(partEditor, '添加部件：给当前物体增加一个新的物理部件。');
  const partMaterial = labeled(advanced, '材料内部编号（高级）', textInput());
  const partMass = labeled(partEditor, '质量', numberInput());
  const partGeometryKind = labeled(partEditor, '形状', selectInput());
  for (const [kind, label] of [['box', '盒体'], ['sphere', '球体'], ['capsule', '胶囊体'], ['convex', '凸包']] as const) addOption(partGeometryKind, kind, label);
  const geometryDimensions = document.createElement('div');
  geometryDimensions.className = 'god-sandbox-row';
  const geometryA = labeled(geometryDimensions, '尺寸 X / 半径', numberInput());
  const geometryB = labeled(geometryDimensions, '尺寸 Y / 半高', numberInput());
  const geometryC = labeled(geometryDimensions, '尺寸 Z', numberInput());
  partEditor.append(geometryDimensions);
  const convexPoints = labeled(advanced, '凸形顶点数据（高级）', textInput());
  const partJson = document.createElement('textarea');
  partJson.setAttribute('aria-label', '选中部件 JSON（高级）');
  const partJsonDetails = document.createElement('details');
  const partJsonSummary = document.createElement('summary');
  partJsonSummary.textContent = '部件原始 JSON（高级）';
  partJsonDetails.append(partJsonSummary, partJson);
  advanced.append(partJsonDetails);
  const partActions = document.createElement('div');
  partActions.className = 'god-sandbox-actions';
  partEditor.append(partActions);
  const applyPartButton = button(partActions, '应用部件修改', () => run('部件已更新', () => {
    requireEdit();
    const entityId = requireEntity();
    const part = requirePart();
    const geometry = selectedGeometry(part, partGeometryKind.value as Geometry['kind'], geometryA.value, geometryB.value, geometryC.value, convexPoints.value);
    construction.updatePart(entityId, {
      ...part,
      materialId: partMaterial.value.trim(),
      mass: partMass.value.trim() === '' ? undefined : parsePositive(partMass.value, '质量'),
      geometry,
    });
  }, true));
  button(partJsonDetails, '应用部件 JSON', () => run('已应用部件 JSON', () => {
    requireEdit();
    const entityId = requireEntity();
    const parsed: unknown = JSON.parse(partJson.value);
    if (!parsed || typeof parsed !== 'object') throw new Error('部件 JSON 必须是对象');
    construction.updatePart(entityId, parsed as Part);
  }, true));
  const addPartButton = button(partActions, '添加部件', () => run('已添加部件', () => {
    requireEdit();
    const inspection = requireInspection();
    const materialId = inspection.blueprint.materials[0]?.id;
    if (!materialId) throw new Error('蓝图中没有可供新部件使用的材料');
    construction.addPart(requireEntity(), {
      id: makeId('part', inspection.blueprint.parts.map((part) => part.id)),
      materialId,
      geometry: { kind: 'box', halfExtents: { x: 0.3, y: 0.3, z: 0.3 } },
      pose: IDENTITY_POSE,
      mass: 1,
    });
  }, true));
  const removePartButton = button(partActions, '删除部件', () => run('已删除部件', () => { requireEdit(); construction.removePart(requireEntity(), requirePart().id); }, true));

  const materialEditor = fieldset(editGroup, '材料');
  hint(materialEditor, '材料修改会重建结构；同一材料编号的部件会一起受到影响。');
  const materialFriction = labeled(materialEditor, '摩擦系数', numberInput());
  const materialDensity = labeled(materialEditor, '密度', numberInput());
  const materialYieldForce = labeled(materialEditor, '屈服载荷 N（高级）', numberInput());
  const materialUltimateForce = labeled(materialEditor, '断裂载荷 N（高级）', numberInput());
  button(materialEditor, '应用材料修改', () => run('材料已更新', () => {
    requireEdit();
    const inspection = requireInspection();
    const current = inspection.blueprint.materials.find((entry) => entry.id === requirePart().materialId);
    if (!current) throw new Error('材料不存在');
    const material: Material = { ...current,
      friction: parseNumber(materialFriction.value, '摩擦系数'),
      density: parsePositive(materialDensity.value, '密度'),
      yieldForceN: materialYieldForce.value.trim() ? parsePositive(materialYieldForce.value, '屈服载荷') : undefined,
      ultimateForceN: materialUltimateForce.value.trim() ? parsePositive(materialUltimateForce.value, '断裂载荷') : undefined,
    };
    construction.replaceBlueprint(inspection.entity.id, { ...inspection.blueprint,
      materials: inspection.blueprint.materials.map((entry) => entry.id === current.id ? material : entry) });
  }, true));

  const connections = fieldset(editGroup, '连接两个部件');
  hint(connections, '连接：把两个部件用物理连接固定在一起。');
  const connectionEndpoints = document.createElement('div');
  connectionEndpoints.className = 'god-sandbox-row';
  const connectionFrom = labeled(connectionEndpoints, '部件一', selectInput());
  const connectionTo = labeled(connectionEndpoints, '部件二', selectInput());
  const newConnectionKind = labeled(connections, '新连接种类', selectInput());
  for (const [kind, label] of [['rigid', '固定'], ['revolute', '旋转'], ['prismatic', '滑动']] as const) addOption(newConnectionKind, kind, label);
  button(connectionEndpoints, '连接部件', () => run('已连接部件', () => {
    requireEdit();
    const inspection = requireInspection();
    const from = inspection.blueprint.parts.find((part) => part.id === connectionFrom.value);
    const to = inspection.blueprint.parts.find((part) => part.id === connectionTo.value);
    if (!from || !to) throw new Error('请选择两个部件');
    if (from.id === to.id) throw new Error('连接需要选择两个不同的部件');
    const rigid = buildRigidConnection(
      makeId('connection', inspection.blueprint.connections.map((connection) => connection.id)), from, to,
    );
    const connection: Connection = newConnectionKind.value === 'rigid' ? rigid
      : { ...rigid, kind: newConnectionKind.value as 'revolute' | 'prismatic', axis: { x: 0, y: 0, z: 1 } };
    construction.addConnection(requireEntity(), connection);
  }, true));
  connections.append(connectionEndpoints);
  const connectionActions = document.createElement('div');
  connectionActions.className = 'god-sandbox-actions';
  connections.append(connectionActions);
  const connectionKind = labeled(connections, '选中连接种类', selectInput());
  for (const [kind, label] of [['rigid', '固定'], ['revolute', '旋转'], ['prismatic', '滑动']] as const) addOption(connectionKind, kind, label);
  const fromAnchorInputs = vectorInputs(connections, '端点一锚点');
  const toAnchorInputs = vectorInputs(connections, '端点二锚点');
  const axisInputs = vectorInputs(connections, '轴向', { x: 0, y: 0, z: 1 });
  const limitMin = labeled(connections, '范围下限', numberInput('-1'));
  const limitMax = labeled(connections, '范围上限', numberInput('1'));
  const connectionStrength = labeled(connections, '抗冲击阈值 N·s（高级）', numberInput());
  const updateConnectionButton = button(connectionActions, '应用连接修改', () => run('连接已更新', () => {
    requireEdit();
    const inspection = requireInspection();
    const current = inspection.blueprint.connections.find((entry) => entry.id === requireConnectionId());
    if (!current) throw new Error('请选择仍存在的连接');
    const base = { id: current.id, fromPartId: current.fromPartId, toPartId: current.toPartId,
      strengthImpulseNs: connectionStrength.value.trim() ? parsePositive(connectionStrength.value, '抗冲击阈值') : undefined,
      yieldForceN: current.yieldForceN,
      ultimateForceN: current.ultimateForceN, yieldTorqueNm: current.yieldTorqueNm,
      ultimateTorqueNm: current.ultimateTorqueNm,
      fromAnchor: readVector(fromAnchorInputs, '端点一锚点'), toAnchor: readVector(toAnchorInputs, '端点二锚点') };
    const connection: Connection = connectionKind.value === 'rigid' ? { ...base, kind: 'rigid' }
      : { ...base, kind: connectionKind.value as 'revolute' | 'prismatic',
        axis: readVector(axisInputs, '轴向'),
        limits: { min: parseNumber(limitMin.value, '范围下限'), max: parseNumber(limitMax.value, '范围上限') } };
    construction.replaceBlueprint(inspection.entity.id, { ...inspection.blueprint,
      connections: inspection.blueprint.connections.map((entry) => entry.id === current.id ? connection : entry) });
  }, true));
  const detachButton = button(connectionActions, '拆开连接', () => run('已拆开连接', () => { requireEdit(); construction.detach(requireEntity(), requireConnectionId()); }, true));
  const reattachButton = button(connectionActions, '重新连接', () => run('已重新连接', () => { requireEdit(); construction.reattach(requireEntity(), requireConnectionId()); }, true));
  const removeConnectionButton = button(connectionActions, '删除连接', () => run('已删除连接', () => { requireEdit(); construction.removeConnection(requireEntity(), requireConnectionId()); }, true));
  const repairConnectionButton = button(connectionActions, '修复此连接', () => run('已修复连接', () => { requireEdit(); construction.repair(requireEntity(), requireConnectionId()); }));
  button(connectionActions, '修复整个结构', () => run('结构已修复', () => { requireEdit(); construction.repair(requireEntity()); }));
  const connectionInspection = document.createElement('pre');
  connectionInspection.className = 'god-sandbox-summary';
  connections.append(connectionInspection);
  const connectionRaw = document.createElement('pre');
  connectionRaw.className = 'god-sandbox-summary';
  advanced.append(connectionRaw);

  const impact = fieldset(impactGroup, '施加作用与修复');
  hint(impact, '施加冲击：给选中部件一个瞬间外力，用于测试损伤和结构变化。');
  const impulseRow = document.createElement('div');
  impulseRow.className = 'god-sandbox-row';
  const impulseX = labeled(impulseRow, '冲击 X', numberInput('0'));
  const impulseY = labeled(impulseRow, '冲击 Y', numberInput('0'));
  const impulseZ = labeled(impulseRow, '冲击 Z', numberInput('1'));
  impact.append(impulseRow);
  const impactButton = button(impact, '对选中部件施加冲击', () => run('已施加冲击', () => {
    const componentId = selectedValue(componentChoice);
    if (!componentId) throw new Error('请选择结构组件');
    const partId = selectedValue(partChoice);
    if (!partId) throw new Error('请选择部件');
    construction.applyImpact(componentId, partId, {
      x: parseNumber(impulseX.value, '冲击 X'),
      y: parseNumber(impulseY.value, '冲击 Y'),
      z: parseNumber(impulseZ.value, '冲击 Z'),
    });
  }));
  const repairPartButton = button(impact, '修复选中部件', () => run('部件已修复', () => { requireEdit(); construction.repair(requireEntity(), requirePart().id); }));

  const attachments = fieldset(editGroup, '执行器与传感器');
  hint(attachments, '执行器让连接产生力或扭矩；传感器安装在部件上。');
  const actuatorChoice = labeled(attachments, '执行器', selectInput());
  const actuatorKind = labeled(attachments, '执行器种类', selectInput());
  addOption(actuatorKind, 'joint', '关节执行器');
  addOption(actuatorKind, 'tension', '拉力执行器');
  const actuatorConnection = labeled(attachments, '驱动连接', selectInput());
  const tensionFrom = labeled(attachments, '拉力端点一部件', selectInput());
  const tensionTo = labeled(attachments, '拉力端点二部件', selectInput());
  const tensionFromInputs = vectorInputs(attachments, '端点一位置');
  const tensionToInputs = vectorInputs(attachments, '端点二位置');
  const maxOutputInput = labeled(attachments, '最大输出 N / N·m', numberInput('10'));
  const responseInput = labeled(attachments, '响应时间 秒', numberInput('0.1'));
  const actuatorActions = document.createElement('div');
  actuatorActions.className = 'god-sandbox-actions';
  attachments.append(actuatorActions);
  const addActuatorButton = button(actuatorActions, '添加执行器', () => run('已添加执行器', () => {
    requireEdit();
    const inspection = requireInspection();
    if (!world.inspectEnergy?.(inspection.entity.id)) throw new Error('当前物体没有能量供应，请生成带能量的结构模板');
    construction.addActuator(requireEntity(), readActuator(makeId('actuator', (inspection.blueprint.actuators ?? []).map((actuator) => actuator.id))));
  }, true));
  function readActuator(id: string): StructuralActuator {
    const common = { id, maxOutput: parsePositive(maxOutputInput.value, '最大输出'),
      responseTimeSeconds: parsePositive(responseInput.value, '响应时间') };
    if (actuatorKind.value === 'tension') {
      if (tensionFrom.value === tensionTo.value) throw new Error('拉力执行器需要两个不同部件');
      return { ...common, kind: 'tension', fromPartId: tensionFrom.value, toPartId: tensionTo.value,
        fromAttachment: readVector(tensionFromInputs, '端点一位置'),
        toAttachment: readVector(tensionToInputs, '端点二位置') };
    }
    const connection = requireInspection().blueprint.connections.find((entry) => entry.id === actuatorConnection.value);
    if (!connection || (connection.kind !== 'revolute' && connection.kind !== 'prismatic')) throw new Error('请选择旋转或滑动连接');
    return { ...common, kind: 'joint', connectionId: connection.id };
  }
  const updateActuatorButton = button(actuatorActions, '应用执行器修改', () => run('执行器已更新', () => {
    requireEdit();
    const inspection = requireInspection();
    const id = selectedValue(actuatorChoice);
    if (!id) throw new Error('请选择执行器');
    construction.replaceBlueprint(inspection.entity.id, { ...inspection.blueprint,
      actuators: inspection.blueprint.actuators?.map((entry) => entry.id === id ? readActuator(id) : entry) });
    manualSources.get(inspection.entity.id)?.delete(id);
  }, true));
  const removeActuatorButton = button(actuatorActions, '删除执行器', () => run('已删除执行器', () => {
    requireEdit();
    const actuatorId = selectedValue(actuatorChoice);
    if (!actuatorId) throw new Error('请选择执行器');
    construction.removeActuator(requireEntity(), actuatorId);
    manualSources.get(requireEntity())?.delete(actuatorId);
  }, true));
  const manualGroup = fieldset(root, '手动控制台');
  hint(manualGroup, '可在暂停时预设信号，运行中也能调整。关节：-1 到 +1；拉力：0 到 1。');
  const controlRows = document.createElement('div');
  manualGroup.append(controlRows);
  const energySummary = document.createElement('pre');
  energySummary.className = 'god-sandbox-summary';
  manualGroup.append(energySummary);
  root.insertBefore(timeGroup, createGroup);
  root.insertBefore(manualGroup, editGroup);
  const sensorChoice = labeled(attachments, '传感器', selectInput());
  const sensorActions = document.createElement('div');
  sensorActions.className = 'god-sandbox-actions';
  attachments.append(sensorActions);
  const addSensorButton = button(sensorActions, '为部件添加距离传感器', () => run('已添加传感器', () => {
    requireEdit();
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
  const removeSensorButton = button(sensorActions, '删除传感器', () => run('已删除传感器', () => {
    requireEdit();
    const sensorId = selectedValue(sensorChoice);
    if (!sensorId) throw new Error('请选择传感器');
    construction.removeSensor(requireEntity(), sensorId);
  }, true));

  const blueprintEditor = fieldset(advanced, '蓝图（Blueprint）JSON');
  const blueprintJson = document.createElement('textarea');
  blueprintJson.setAttribute('aria-label', '蓝图（Blueprint）JSON');
  blueprintEditor.append(blueprintJson);
  const blueprintActions = document.createElement('div');
  blueprintActions.className = 'god-sandbox-actions';
  blueprintEditor.append(blueprintActions);
  button(blueprintActions, '检查 JSON', () => {
    try {
      const parsed: unknown = JSON.parse(blueprintJson.value);
      if (!parsed || typeof parsed !== 'object') throw new Error('蓝图 JSON 必须是对象');
      const errors = construction.validate(parsed as Blueprint).map(localizeValidationError);
      validationErrors.textContent = errors.join('\n');
      validationErrors.hidden = errors.length === 0;
      setStatus(errors.length ? `蓝图检查未通过：${errors.join('；')}` : '蓝图格式正确', errors.length > 0);
    } catch (error) {
      validationErrors.textContent = formatError(error);
      validationErrors.hidden = false;
      setStatus(formatError(error), true);
    }
  });
  button(blueprintActions, '保存当前物体蓝图', () => run('蓝图已载入编辑区', () => {
    blueprintJson.value = construction.saveBlueprint(requireEntity());
  }, true));
  button(blueprintActions, '应用到当前物体', () => run('已应用蓝图', () => {
    requireEdit();
    construction.replaceBlueprint(requireEntity(), parseBlueprintJson());
  }, true));
  button(blueprintActions, '作为新物体载入', () => run('已从蓝图生成新物体', () => {
    requireEdit();
    const blueprint = parseBlueprintJson();
    const entity: Entity = {
      id: nextSandboxEntityId('sandbox-import'),
      blueprint,
    };
    const manual = new ManualControlSource();
    const supply: EnergySourceSpec = {
      capacityJ: parsePositive(capacityInput.value, '能量容量'),
      maxPowerWatts: parsePositive(powerInput.value, '功率上限'),
      efficiency: parsePositive(efficiencyInput.value, '效率'),
    };
    if (supply.efficiency > 1) throw new Error('效率不能大于 1');
    construction.spawn(entity, {
      ...options.spawnOptions,
      energy: supply,
      control: manual.control,
    });
    manualSources.set(entity.id, manual);
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
  for (const control of [materialFriction, materialDensity, materialYieldForce, materialUltimateForce]) control.addEventListener('input', () => { materialDraftDirty = true; });
  for (const control of [connectionKind, ...fromAnchorInputs, ...toAnchorInputs, ...axisInputs, limitMin, limitMax, connectionStrength]) control.addEventListener('input', () => { connectionDraftDirty = true; });
  for (const control of [actuatorKind, actuatorConnection, tensionFrom, tensionTo, ...tensionFromInputs, ...tensionToInputs, maxOutputInput, responseInput]) control.addEventListener('input', () => { actuatorDraftDirty = true; });

  const inspectionDetails = document.createElement('details');
  inspectionDetails.className = 'god-sandbox-collapsed';
  const inspectionSummary = document.createElement('summary');
  inspectionSummary.textContent = '完整检查数据 JSON';
  const inspectionJson = document.createElement('pre');
  inspectionDetails.append(inspectionSummary, inspectionJson);
  advanced.append(inspectionDetails);

  function setStatus(message: string, error = false): void {
    status.textContent = message;
    status.dataset.error = error ? 'true' : 'false';
  }

  function requireEntity(): string {
    if (!selectedEntityId) throw new Error('请先选择物体');
    return selectedEntityId;
  }

  function requireInspection(): GodSandboxInspection {
    return construction.inspect(requireEntity());
  }

  function requirePart(): Part {
    const part = requireInspection().blueprint.parts.find((entry) => entry.id === selectedPartId);
    if (!part) throw new Error('请选择部件');
    return part;
  }

  function requireConnectionId(): string {
    if (!selectedConnectionId) throw new Error('请选择连接');
    return selectedConnectionId;
  }

  function parseBlueprintJson(): Blueprint {
    const parsed: unknown = JSON.parse(blueprintJson.value);
    if (!parsed || typeof parsed !== 'object') throw new Error('蓝图 JSON 必须是对象');
    const blueprint = parsed as Blueprint;
    const errors = construction.validate(blueprint);
    if (errors.length) throw new Error(errors.map(localizeValidationError).join('；'));
    return blueprint;
  }

  function run(success: string, action: () => void, resetDrafts = false): void {
    try {
      action();
      if (resetDrafts) {
        blueprintDraftDirty = false;
        partDraftDirty = false;
        materialDraftDirty = false;
        connectionDraftDirty = false;
        actuatorDraftDirty = false;
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
    if (entities.length === 0) addOption(entityChoice, '', '当前世界没有物体');
    for (const [index, entity] of entities.entries()) addOption(entityChoice, entity.id, `${friendlyBlueprintName(entity.blueprintId)} ${index + 1}`, entity.id === selectedEntityId);
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
      entitySummary.textContent = '请选择一个物体以查看和编辑结构。';
      structureSummary.textContent = '';
      partJson.value = '';
      if (!blueprintDraftDirty) blueprintJson.value = '';
      inspectionJson.textContent = '';
      connectionInspection.textContent = '';
      connectionRaw.textContent = '';
      energySummary.textContent = '选择结构后显示能量。';
      controlRows.textContent = '';
      controlRenderKey = '';
      partPosition.textContent = '';
      setDisabled(true);
      options.onSelectionChanged?.();
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
    entitySummary.textContent = `部件 ${blueprint.parts.length} · 连接 ${blueprint.connections.length} · 执行器 ${blueprint.actuators?.length ?? 0} · 传感器 ${blueprint.sensors?.length ?? 0}`;
    const energy = world.inspectEnergy?.(entity.id);
    energySummary.textContent = energy ? `容量 ${energy.capacityJ.toFixed(2)} J · 剩余 ${energy.remainingEnergyJ.toFixed(2)} J\n已消耗 ${energy.consumedEnergyJ.toFixed(2)} J · 功率上限 ${energy.maxPowerWatts.toFixed(2)} W\n当前机械功率 ${energy.stepMechanicalPowerWatts.toFixed(2)} W · 效率 ${(energy.efficiency * 100).toFixed(0)}%`
      : '当前物体没有能量供应。';
    structureSummary.textContent = `${renderDamageSummary(inspection.damage)}\n结构组件 ${components.length}${detached.length ? ` · 已拆开连接 ${detached.length}` : ''}`;

    componentChoice.textContent = '';
    if (components.length === 0) addOption(componentChoice, '', '无结构组件');
    for (const [index, component] of components.entries()) addOption(componentChoice, component.id, `组件 ${index + 1}`, component.id === selectedComponentId);
    partChoice.textContent = '';
    for (const [index, part] of blueprint.parts.entries()) addOption(partChoice, part.id, `部件 ${index + 1}`, part.id === selectedPartId);
    const pose = selectedPartId && selectedComponentId ? world.readPartPose?.(selectedComponentId, selectedPartId) : undefined;
    const velocity = selectedPartId ? world.readPartVelocity?.(entity.id, selectedPartId) : undefined;
    const contacts = selectedPartId ? world.readPartContacts?.(entity.id, selectedPartId) : undefined;
    partPosition.textContent = pose ? `当前位置：X ${pose.position.x.toFixed(2)} · Y ${pose.position.y.toFixed(2)} · Z ${pose.position.z.toFixed(2)}\n速度：${velocity ? `${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)} m/s` : '无读数'} · 接触点 ${contacts?.length ?? 0}` : '';
    connectionChoice.textContent = '';
    if (allConnections.length === 0) addOption(connectionChoice, '', '无连接');
    for (const { connection, detached: isDetached } of allConnections) {
      const index = allConnections.findIndex((entry) => entry.connection.id === connection.id);
      addOption(connectionChoice, connection.id, `连接 ${index + 1}${isDetached ? ' · 已拆开' : ''}`, connection.id === selectedConnectionId);
    }
    connectionFrom.textContent = '';
    connectionTo.textContent = '';
    for (const part of blueprint.parts) {
      addOption(connectionFrom, part.id, `部件 ${blueprint.parts.indexOf(part) + 1}`, part.id === blueprint.parts[0]?.id);
      addOption(connectionTo, part.id, `部件 ${blueprint.parts.indexOf(part) + 1}`, part.id === blueprint.parts[1]?.id);
    }
    actuatorConnection.textContent = '';
    for (const connection of blueprint.connections.filter((entry) => entry.kind !== 'rigid')) addOption(actuatorConnection, connection.id, connection.id);
    for (const select of [tensionFrom, tensionTo]) {
      select.textContent = '';
      for (const part of blueprint.parts) addOption(select, part.id, part.id);
    }
    if (!blueprint.actuators?.some((entry) => entry.id === selectedActuatorId)) selectedActuatorId = blueprint.actuators?.[0]?.id;
    actuatorChoice.textContent = '';
    if (!(blueprint.actuators?.length)) addOption(actuatorChoice, '', '无执行器');
    for (const [index, actuator] of (blueprint.actuators ?? []).entries()) addOption(actuatorChoice, actuator.id, `执行器 ${index + 1} · ${actuator.kind === 'tension' ? '拉力' : '关节'}`, actuator.id === selectedActuatorId);
    if (!actuatorDraftDirty) {
      const actuator = blueprint.actuators?.find((entry) => entry.id === selectedActuatorId);
      if (actuator) {
        actuatorKind.value = actuator.kind === 'tension' ? 'tension' : 'joint';
        maxOutputInput.value = String(actuator.maxOutput);
        responseInput.value = String(actuator.responseTimeSeconds ?? 0.1);
        if (actuator.kind === 'tension') {
          tensionFrom.value = actuator.fromPartId;
          tensionTo.value = actuator.toPartId;
          setVector(tensionFromInputs, actuator.fromAttachment);
          setVector(tensionToInputs, actuator.toAttachment);
        } else actuatorConnection.value = actuator.connectionId;
      }
    }
    const activeActuatorIds = new Set(entity.actuatorIds);
    for (const actuator of blueprint.actuators ?? []) {
      if (!activeActuatorIds.has(actuator.id)) manualSources.get(entity.id)?.delete(actuator.id);
    }
    const nextControlKey = `${entity.id}/${(blueprint.actuators ?? []).map((actuator) => `${actuator.id}:${actuator.kind}:${activeActuatorIds.has(actuator.id)}`).join(',')}`;
    if (nextControlKey !== controlRenderKey) {
      controlRows.textContent = '';
      controlRenderKey = nextControlKey;
    for (const actuator of blueprint.actuators ?? []) {
      const row = document.createElement('label');
      const caption = document.createElement('span');
      caption.textContent = `${actuator.kind === 'tension' ? '拉力' : '关节'} ${actuator.id}${activeActuatorIds.has(actuator.id) ? '' : ' · 已分离'}`;
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = actuator.kind === 'tension' ? '0' : '-1';
      slider.max = '1';
      slider.step = '0.05';
      slider.value = String(manualSources.get(entity.id)?.get(actuator.id) ?? 0);
      slider.disabled = !manualSources.has(entity.id) || !activeActuatorIds.has(actuator.id);
      const value = document.createElement('output');
      value.textContent = slider.value;
      slider.addEventListener('input', () => {
        manualSources.get(entity.id)?.set(actuator.id, actuator.kind === 'tension' ? 'tension' : 'joint', Number(slider.value));
        value.textContent = slider.value;
      });
      row.append(caption, slider, value);
      controlRows.append(row);
    }
    }
    sensorChoice.textContent = '';
    if (!(blueprint.sensors?.length)) addOption(sensorChoice, '', '无传感器');
    for (const [index, sensor] of (blueprint.sensors ?? []).entries()) addOption(sensorChoice, sensor.id, `传感器 ${index + 1}`);
    if (!blueprintDraftDirty) blueprintJson.value = JSON.stringify(blueprint, null, 2);
    inspectionJson.textContent = JSON.stringify(inspection, null, 2);
    if (!partDraftDirty) renderPartEditor(blueprint);
    const selectedPart = blueprint.parts.find((entry) => entry.id === selectedPartId);
    const selectedMaterial = blueprint.materials.find((entry) => entry.id === selectedPart?.materialId);
    if (selectedMaterial && !materialDraftDirty) {
      materialFriction.value = String(selectedMaterial.friction);
      materialDensity.value = String(selectedMaterial.density);
      materialYieldForce.value = selectedMaterial.yieldForceN === undefined ? '' : String(selectedMaterial.yieldForceN);
      materialUltimateForce.value = selectedMaterial.ultimateForceN === undefined ? '' : String(selectedMaterial.ultimateForceN);
    }
    const selectedConnection = allConnections.find(({ connection }) => connection.id === selectedConnectionId);
    if (selectedConnection && !connectionDraftDirty) {
      connectionKind.value = selectedConnection.connection.kind;
      setVector(fromAnchorInputs, selectedConnection.connection.fromAnchor);
      setVector(toAnchorInputs, selectedConnection.connection.toAnchor);
      if (selectedConnection.connection.kind !== 'rigid') {
        setVector(axisInputs, selectedConnection.connection.axis);
        limitMin.value = String(selectedConnection.connection.limits?.min ?? -1);
        limitMax.value = String(selectedConnection.connection.limits?.max ?? 1);
      }
      connectionStrength.value = selectedConnection.connection.strengthImpulseNs === undefined ? '' : String(selectedConnection.connection.strengthImpulseNs);
    }
    const damage = selectedConnection ? inspection.damage.connections[selectedConnection.connection.id] : undefined;
    const load = selectedConnection && damage?.connected ? world.readConnectionLoad?.(entity.id, selectedConnection.connection.id) : undefined;
    connectionInspection.textContent = selectedConnection
      ? `${selectedConnection.detached || !damage?.connected ? '已分离 / 当前无载荷读数' : '已连接'}\n损伤：${damageLabel(damage?.damage.state)} · 变形：${damage?.damage.deformation ?? 0}\n${load ? `当前力 ${load.forceN.toFixed(2)} N · 扭矩 ${load.torqueNm.toFixed(2)} N·m` : '当前无载荷读数'}`
      : '请选择连接。';
    connectionRaw.textContent = selectedConnection ? JSON.stringify(selectedConnection.connection, null, 2) : '';
    detachButton.disabled = !selectedConnection || selectedConnection.detached;
    reattachButton.disabled = !selectedConnection || !selectedConnection.detached;
    removeConnectionButton.disabled = !selectedConnection || selectedConnection.detached;
    repairConnectionButton.disabled = !selectedConnection || selectedConnection.detached;
    addActuatorButton.disabled = !energy || blueprint.parts.length < 2 || (actuatorKind.value !== 'tension' && !blueprint.connections.some((entry) => entry.kind !== 'rigid'));
    updateActuatorButton.disabled = !selectedActuatorId;
    updateConnectionButton.disabled = !selectedConnection || selectedConnection.detached;
    repairPartButton.disabled = !selectedPartId || !editing();
    impactButton.disabled = !selectedComponentId || !selectedPartId
      || !components.some((component) => component.id === selectedComponentId && component.partIds.includes(selectedPartId!));
    applyPartButton.disabled = !selectedPartId;
    addPartButton.disabled = false;
    removePartButton.disabled = !selectedPartId;
    addSensorButton.disabled = !selectedPartId;
    removeActuatorButton.disabled = !(blueprint.actuators?.length);
    removeSensorButton.disabled = !(blueprint.sensors?.length);
    setDisabled(false);
    editGroup.disabled = !editing();
    blueprintEditor.disabled = !editing();
    options.onSelectionChanged?.(selectedEntityId, selectedPartId);
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
    materialDraftDirty = false;
    renderInspection();
  });
  connectionChoice.addEventListener('change', () => { selectedConnectionId = selectedValue(connectionChoice); connectionDraftDirty = false; renderInspection(); });
  actuatorChoice.addEventListener('change', () => { selectedActuatorId = selectedValue(actuatorChoice); actuatorDraftDirty = false; renderInspection(); });
  componentChoice.addEventListener('change', () => { selectedComponentId = selectedValue(componentChoice); renderInspection(); });

  function refresh(): void {
    pauseButton.textContent = world.paused ? '进入运行模式' : '暂停并进入编辑模式';
    modeSummary.textContent = world.paused ? '编辑模式 · 物理暂停' : '运行模式 · 结构编辑已锁定';
    createGroup.disabled = !editing();
    stepButton.disabled = !editing();
    renderEntityOptions();
    renderInspection();
  }

  if (world.listEntities().length === 0 && catalog.some((entry) => entry.id === 'tension-mechanism')) {
    blueprintChoice.value = 'tension-mechanism';
    spawnTemplate();
  }
  refresh();
  return {
    element: root,
    refresh,
    destroy: () => root.remove(),
  };
}
