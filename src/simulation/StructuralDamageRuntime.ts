import { applyConnectionLoad, createDamageState, type DamageEvent, type StructuralDamageState } from '../core/damage';
import type { Blueprint } from '../core/model';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';

/** Routes measured impact and connection loads through the same Core damage state. */
export class StructuralDamageRuntime {
  private current: StructuralDamageState;
  private readonly incidentConnections = new Map<string, readonly string[]>();
  private readonly retiredParts = new Set<string>();

  constructor(
    private readonly blueprint: Blueprint,
    private readonly physics: PhysicsAdapter,
    private readonly body: PhysicsBody,
    initialState?: StructuralDamageState,
  ) {
    this.current = initialState ?? createDamageState(blueprint);
    for (const part of blueprint.parts) {
      this.incidentConnections.set(part.id, blueprint.connections
        .filter((connection) => connection.fromPartId === part.id || connection.toPartId === part.id)
        .map((connection) => connection.id));
    }
  }

  get state(): StructuralDamageState { return this.current; }

  /** Removed structural components no longer contribute physical load. */
  retireParts(partIds: readonly string[]): void {
    for (const partId of partIds) this.retiredParts.add(partId);
  }

  /**
   * A first-order load path: an impacted Part shares its measured impulse
   * equally among its remaining structural connections. Rapier still decides
   * how every rigid body actually moves; the Core decides when a path fails.
   */
  afterPhysicsStep(tick: number, seconds = 1 / 60): readonly DamageEvent[] {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('Damage step must be positive and finite');
    const events: DamageEvent[] = [];
    for (const part of this.blueprint.parts) {
      if (this.retiredParts.has(part.id)) continue;
      const impulseNs = this.physics.readPartImpactImpulse(this.body, part.id);
      if (impulseNs <= 0) continue;
      const connected = (this.incidentConnections.get(part.id) ?? [])
        .filter((id) => this.current.connections[id]?.connected);
      if (connected.length === 0) continue;
      const connectionImpulseNs = impulseNs / connected.length;
      for (const connectionId of connected) {
        const result = applyConnectionLoad(this.current, this.blueprint, {
          connectionId, impulseNs: connectionImpulseNs, tick,
        });
        this.current = result.state;
        events.push(...result.events);
        for (const event of result.events) {
          if (event.target === 'connection' && event.kind === 'separation') {
            this.physics.breakConnection(this.body, event.connectionId);
          }
        }
      }
    }
    for (const connection of this.blueprint.connections) {
      if (!this.current.connections[connection.id]?.connected
        || this.retiredParts.has(connection.fromPartId)
        || this.retiredParts.has(connection.toPartId)) continue;
      const { forceN, torqueNm } = this.physics.readConnectionLoad(this.body, connection.id);
      if (forceN <= 0 && torqueNm <= 0) continue;
      const result = applyConnectionLoad(this.current, this.blueprint, {
        connectionId: connection.id, impulseNs: 0, forceN, torqueNm, seconds, tick,
      });
      this.current = result.state;
      events.push(...result.events);
      for (const event of result.events) {
        if (event.target === 'connection' && event.kind === 'separation') {
          this.physics.breakConnection(this.body, event.connectionId);
        }
      }
    }
    return events;
  }
}
