import { applyConnectionLoad, applyPartLoad, createDamageState, type DamageEvent, type StructuralDamageState } from '../core/damage';
import type { Blueprint } from '../core/model';
import type { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsBody } from '../physics/PhysicsBody';

/** Routes measured impact and connection loads through the same Core damage state. */
export class StructuralDamageRuntime {
  private current: StructuralDamageState;
  private readonly incidentConnections = new Map<string, readonly string[]>();
  private readonly retiredParts = new Set<string>();
  private readonly previousContactImpulse = new Map<string, number>();

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

  /** Route external contact to Part material, internal reaction to Connections. */
  afterPhysicsStep(tick: number, seconds = 1 / 60): readonly DamageEvent[] {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('Damage step must be positive and finite');
    const events: DamageEvent[] = [];
    for (const part of this.blueprint.parts) {
      if (this.retiredParts.has(part.id)) continue;
      const contact = this.physics.readPartContactLoad(this.body, part.id);
      const previous = this.previousContactImpulse.get(part.id) ?? 0;
      this.previousContactImpulse.set(part.id, contact.impulseNs);
      // Only a rising contact impulse enters the transient channel. A steady
      // support reaction enters the sustained-force integral once per step.
      if (contact.impulseNs > 0 || contact.forceN > 0) {
        const result = applyPartLoad(this.current, this.blueprint, {
          partId: part.id, impulseNs: Math.max(0, contact.impulseNs - previous),
          forceN: contact.forceN, seconds, tick,
        });
        this.current = result.state;
        events.push(...result.events);
        for (const event of result.events) if (event.target === 'connection' && event.kind === 'separation' && event.connectionId) {
          this.physics.breakConnection(this.body, event.connectionId);
        }
      }
      // Preserve the earlier explicit-impulse structural experiment path.
      // Contact impulses have already gone through Part and are excluded here.
      const impulseNs = this.physics.readPartAppliedImpulse(this.body, part.id);
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
          if (event.target === 'connection' && event.kind === 'separation' && event.connectionId) {
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
        connectionId: connection.id, impulseNs: 0, forceN, torqueNm, seconds, tick, loadEndpoints: false,
      });
      this.current = result.state;
      events.push(...result.events);
      for (const event of result.events) {
        if (event.target === 'connection' && event.kind === 'separation' && event.connectionId) {
          this.physics.breakConnection(this.body, event.connectionId);
        }
      }
    }
    return events;
  }
}
