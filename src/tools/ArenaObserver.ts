import type { Vector3 } from '../core/model';
import { WorldRuntime } from '../simulation/WorldRuntime';
import type { LeopardAgentRuntime } from './LeopardAgent';

export interface FighterObservation {
  readonly entityId: string;
  readonly position: Vector3;
  readonly speedMps: number;
  readonly connectedComponents: number;
  readonly activeActuators: number;
  readonly energyRemainingJ: number;
  readonly maxPartDeformation: number;
  readonly fracturedParts: number;
  readonly separatedConnections: number;
  readonly goal: string;
  readonly skill: string;
  readonly stability: string;
  readonly decisionCount: number;
}

export interface ArenaObservation {
  readonly elapsedSeconds: number;
  readonly ended: boolean;
  readonly reason?: string;
  readonly fighters: readonly FighterObservation[];
}

const anchors = [
  { entityId: 'leopard-a', partId: 'leopard-chest' },
  { entityId: 'leopard-b', partId: 'leopard-chest' },
] as const;

/** Read-only match inspection; all physical and structural state stays in WorldRuntime. */
export class ArenaObserver {
  constructor(private readonly agents: ReadonlyMap<string, LeopardAgentRuntime> = new Map()) {}

  observe(world: WorldRuntime, manualEnd = false): ArenaObservation {
    const fighters = anchors.map(({ entityId, partId }): FighterObservation => {
      const entity = world.inspectEntity(entityId);
      if (!entity) throw new Error(`Missing Arena Entity: ${entityId}`);
      const damage = world.getDamageRuntime(entityId).state;
      const velocity = world.readPartVelocity(entityId, partId)!;
      const parts = Object.values(damage.parts);
      const agent = this.agents.get(entityId)?.inspect();
      return {
        entityId,
        position: world.readPartPose(entityId, partId).position,
        speedMps: Math.hypot(velocity.x, velocity.z),
        connectedComponents: entity.componentIds.length,
        activeActuators: entity.actuatorIds.length,
        energyRemainingJ: world.inspectEnergy(entityId)?.remainingEnergyJ ?? 0,
        maxPartDeformation: Math.max(...parts.map((part) => part.damage.deformation)),
        fracturedParts: parts.filter((part) => part.damage.state === 'fractured').length,
        separatedConnections: Object.values(damage.connections).filter((connection) => !connection.connected).length,
        goal: agent?.goal ?? '等待感知', skill: agent?.skill ?? 'stand',
        stability: agent?.stability ?? 'unknown', decisionCount: agent?.decisionCount ?? 0,
      };
    });
    const elapsedSeconds = world.tick * world.fixedSeconds;
    const lostChassis = anchors.find(({ entityId, partId }) =>
      world.getDamageRuntime(entityId).state.parts[partId].damage.state === 'fractured');
    const outside = fighters.find(({ position }) => Math.abs(position.x) > 7 || Math.abs(position.z) > 5);
    const reason = manualEnd ? '手动结束' : lostChassis ? `${lostChassis.entityId} 胸部结构断裂`
      : outside ? `${outside.entityId} 越界` : elapsedSeconds >= 90 ? '90 秒时间到' : undefined;
    return { elapsedSeconds, ended: reason !== undefined, ...(reason ? { reason } : {}), fighters };
  }
}
