import { validateEnergySourceSpec, type EnergySourceSpec } from '../core/actuation';
import type { Blueprint, Vector3 } from '../core/model';

export type LabExperiment = 'grip' | 'lift' | 'damage' | 'custom';
export interface LabEntityDesign {
  readonly key: string;
  readonly blueprint: Blueprint;
  readonly origin: Vector3;
  readonly energy?: EnergySourceSpec;
  readonly controls: Readonly<Record<string, number>>;
  readonly templateId?: string;
  readonly companionOf?: string;
}
export interface LabDesign {
  readonly format: 'morphodyne-lab';
  readonly version: 1;
  readonly name: string;
  readonly experiment: LabExperiment;
  readonly environment: { readonly weather: 'clear' | 'rain'; readonly timeOfDay: number };
  readonly timeScale: number;
  readonly impulse: Vector3;
  readonly entities: readonly LabEntityDesign[];
}
export type BlueprintCheck = (blueprint: Blueprint) => readonly string[];
export const LAB_TIME_SCALES = [0.1, 0.25, 0.5, 1] as const;
const MAX_FILE_CHARS = 2_000_000;
const LIBRARY_KEY = 'morphodyne.lab.library.v1';
export const LAB_RETURN_KEY = 'morphodyne.lab.return.v1';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('作品字段必须是对象');
  return value as Record<string, unknown>;
}
function vector(value: unknown): Vector3 {
  const v = object(value);
  if (![v.x, v.y, v.z].every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('位置或冲击必须是有限数值');
  return { x: v.x as number, y: v.y as number, z: v.z as number };
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error(`${label}需要 1–120 个字符`);
  return value.trim();
}

/** Validate every declaration before the caller touches the current world or storage. */
export function parseLabDesign(json: string, check: BlueprintCheck): LabDesign {
  if (json.length > MAX_FILE_CHARS) throw new Error('作品文件超过 2 MB 限制');
  const root = object(JSON.parse(json));
  if (root.format !== 'morphodyne-lab' || root.version !== 1) throw new Error('不支持的作品格式或版本（需要 v1）');
  const name = text(root.name, '作品名');
  if (!['grip', 'lift', 'damage', 'custom'].includes(root.experiment as string)) throw new Error('实验入口无效');
  const env = object(root.environment);
  if (env.weather !== 'clear' && env.weather !== 'rain') throw new Error('天气无效');
  if (typeof env.timeOfDay !== 'number' || !Number.isFinite(env.timeOfDay) || env.timeOfDay < 0 || env.timeOfDay >= 24) throw new Error('时间需在 0–24 小时内');
  if (typeof root.timeScale !== 'number' || !LAB_TIME_SCALES.some(value => value === root.timeScale)) throw new Error('模拟速度无效');
  if (!Array.isArray(root.entities) || root.entities.length === 0 || root.entities.length > 64) throw new Error('作品需包含 1–64 个物体');
  const keys = new Set<string>();
  const entities: LabEntityDesign[] = root.entities.map(raw => {
    const entry = object(raw);
    const key = text(entry.key, '物体编号');
    if (keys.has(key)) throw new Error(`重复物体编号：${key}`);
    keys.add(key);
    const blueprint = object(entry.blueprint) as unknown as Blueprint;
    if (!Array.isArray(blueprint.parts) || !blueprint.parts.length || blueprint.parts.length > 512) throw new Error('每个物体需包含 1–512 个部件');
    const errors = check(blueprint);
    if (errors.length) throw new Error(`蓝图校验失败：${errors.join('；')}`);
    let energy: EnergySourceSpec | undefined;
    if (entry.energy !== undefined) {
      energy = object(entry.energy) as unknown as EnergySourceSpec;
      const energyErrors = validateEnergySourceSpec(energy);
      if (energyErrors.length) throw new Error(`能量配置无效：${energyErrors.join('；')}`);
    }
    if (blueprint.actuators?.length && !energy) throw new Error('带执行器的作品需要初始能量配置');
    const controls = object(entry.controls);
    for (const [id, value] of Object.entries(controls)) {
      const actuator = blueprint.actuators?.find(a => a.id === id);
      if (!actuator || typeof value !== 'number' || !Number.isFinite(value) || value > 1 || value < (actuator.kind === 'tension' ? 0 : -1)) throw new Error(`控制信号无效：${id}`);
    }
    return { key, blueprint, origin: vector(entry.origin), controls: controls as Record<string, number>,
      ...(energy ? { energy } : {}),
      ...(entry.templateId === undefined ? {} : { templateId: text(entry.templateId, '模板编号') }),
      ...(entry.companionOf === undefined ? {} : { companionOf: text(entry.companionOf, '载荷关系') }) };
  });
  for (const entity of entities) if (entity.companionOf && (!keys.has(entity.companionOf) || entity.companionOf === entity.key)) throw new Error('独立载荷关系指向不存在的物体或自身');
  // JSON roundtrip removes object references shared with an editor draft.
  return JSON.parse(JSON.stringify({ format: 'morphodyne-lab', version: 1, name,
    experiment: root.experiment, environment: env, timeScale: root.timeScale,
    impulse: vector(root.impulse), entities })) as LabDesign;
}

export interface LabStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export class LabLibrary {
  constructor(private readonly storage: LabStorage, private readonly check: BlueprintCheck) {}
  list(): readonly LabDesign[] {
    const raw = this.storage.getItem(LIBRARY_KEY);
    if (raw === null) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('本地作品库格式损坏；原数据保留，请先导出当前设计');
    return entries.map(value => parseLabDesign(JSON.stringify(value), this.check));
  }
  save(design: LabDesign): void {
    const validated = parseLabDesign(JSON.stringify(design), this.check);
    const next = this.list().filter(entry => entry.name !== validated.name);
    this.storage.setItem(LIBRARY_KEY, JSON.stringify([...next, validated]));
  }
  delete(name: string): void {
    this.storage.setItem(LIBRARY_KEY, JSON.stringify(this.list().filter(entry => entry.name !== name)));
  }
}
