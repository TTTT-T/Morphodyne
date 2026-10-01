import type { Vector3 } from '../core/model';
import type { LabDesign } from './LabDesign';
import type { GodSandboxConstruction, GodSandboxWorld } from './GodSandboxPanel';

export interface LabPartResult {
  readonly label: string;
  readonly height: number;
  readonly rise: number;
  readonly displacement: number;
  readonly contacts: number;
  readonly sampledPeakForceN: number;
}
export interface LabResult {
  readonly seconds: number;
  readonly samples: number;
  readonly parts: readonly LabPartResult[];
  readonly energyJ: number;
  readonly damagedParts: number;
  readonly fractures: number;
  readonly separated: number;
  readonly inactiveActuators: number;
  readonly conditions: string;
  readonly changedDuringTrial: boolean;
}

export function describeLabConditions(design: LabDesign): string {
  const objects = design.entities.map(e => `${e.blueprint.id}: ${e.blueprint.parts.map(p => `${p.id} ${p.mass ?? '密度'}kg`).join(', ')}; 摩擦 ${e.blueprint.materials.map(m => m.friction).join('/')}; 连接阈值 ${e.blueprint.connections.map(c => c.strengthImpulseNs ?? '默认').join('/')}; 输出 ${e.blueprint.actuators?.map(a => a.maxOutput).join('/') ?? '无'}; 信号 ${JSON.stringify(e.controls)}; 拉力端点 ${e.blueprint.actuators?.filter(a => a.kind === 'tension').map(a => JSON.stringify([a.fromAttachment, a.toAttachment])).join('/') ?? ''}; 出生 ${JSON.stringify(e.origin)}; 能量 ${JSON.stringify(e.energy) ?? '无'}`);
  return `${design.environment.weather} / ${design.environment.timeOfDay}h / ${design.timeScale}×\n冲击 N·s ${JSON.stringify(design.impulse)}\n${objects.join('\n')}`;
}

/** Samples completed world ticks through read-only inspection. Peaks are sampled, not solver-wide maxima. */
export class LabObservation {
  private startTick = 0;
  private lastTick = -1;
  private samples = 0;
  private readonly starts = new Map<string, Vector3>();
  private readonly peaks = new Map<string, number>();
  private initial?: LabDesign;
  begin(world: GodSandboxWorld, construction: GodSandboxConstruction, design: LabDesign): void {
    this.startTick = world.tick ?? 0;
    this.lastTick = this.startTick;
    this.samples = 0;
    this.starts.clear();
    this.peaks.clear();
    this.initial = design;
    for (const entity of world.listEntities()) {
      const inspection = construction.inspect(entity.id);
      for (const part of inspection.blueprint.parts) {
        const component = inspection.components.find(c => c.partIds.includes(part.id));
        const pose = component ? world.readPartPose?.(component.id, part.id) : undefined;
        if (pose) this.starts.set(`${entity.id}/${part.id}`, { ...pose.position });
      }
    }
  }
  sample(world: GodSandboxWorld, construction: GodSandboxConstruction): void {
    const tick = world.tick ?? 0;
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    this.samples++;
    for (const entity of world.listEntities()) for (const part of construction.inspect(entity.id).blueprint.parts) {
      const key = `${entity.id}/${part.id}`;
      const force = world.readPartContactLoad?.(entity.id, part.id)?.forceN ?? 0;
      this.peaks.set(key, Math.max(force, this.peaks.get(key) ?? 0));
    }
  }
  read(world: GodSandboxWorld, construction: GodSandboxConstruction, design: LabDesign): LabResult {
    let energyJ = 0, damagedParts = 0, fractures = 0, separated = 0, inactiveActuators = 0;
    const parts: LabPartResult[] = [];
    for (const [index, entity] of world.listEntities().entries()) {
      const inspection = construction.inspect(entity.id);
      energyJ += world.inspectEnergy?.(entity.id)?.consumedEnergyJ ?? 0;
      damagedParts += Object.values(inspection.damage.parts).filter(p => p.damage.state !== 'intact').length;
      fractures += Object.values(inspection.damage.parts).filter(p => p.damage.state === 'fractured').length;
      separated += Object.values(inspection.damage.connections).filter(c => !c.connected).length;
      inactiveActuators += (inspection.blueprint.actuators?.length ?? 0) - entity.actuatorIds.length;
      for (const part of inspection.blueprint.parts) {
        const component = inspection.components.find(c => c.partIds.includes(part.id));
        const pose = component ? world.readPartPose?.(component.id, part.id) : undefined;
        if (!pose) continue;
        const start = this.starts.get(`${entity.id}/${part.id}`) ?? pose.position;
        const p = pose.position;
        parts.push({ label: `${index + 1} · ${part.id}`, height: p.y, rise: p.y - start.y,
          displacement: Math.hypot(p.x - start.x, p.y - start.y, p.z - start.z),
          contacts: world.readPartContacts?.(entity.id, part.id)?.length ?? 0,
          sampledPeakForceN: this.peaks.get(`${entity.id}/${part.id}`) ?? 0 });
      }
    }
    return { seconds: ((world.tick ?? 0) - this.startTick) * (world.fixedSeconds ?? 1 / 60), samples: this.samples,
      parts, energyJ, damagedParts, fractures, separated, inactiveActuators,
      conditions: describeLabConditions(this.initial ?? design),
      changedDuringTrial: JSON.stringify(this.initial?.entities) !== JSON.stringify(design.entities)
        || JSON.stringify(this.initial?.environment) !== JSON.stringify(design.environment)
        || JSON.stringify(this.initial?.impulse) !== JSON.stringify(design.impulse)
        || this.initial?.timeScale !== design.timeScale };
  }
}
