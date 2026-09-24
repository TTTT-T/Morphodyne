import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { WorldControlSource } from '../simulation/WorldRuntime';

/** Signal ranges exposed by the manual sandbox controls. */
export type ManualControlKind = 'joint' | 'tension';

interface ManualControlValue {
  readonly kind: ManualControlKind;
  readonly value: number;
}

function requireActuatorId(actuatorId: string): string {
  if (!actuatorId.trim()) throw new Error('Manual control actuator id is required');
  return actuatorId;
}

function clampValue(actuatorId: string, kind: ManualControlKind, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid manual control value: ${actuatorId}`);
  const minimum = kind === 'tension' ? 0 : -1;
  return Math.max(minimum, Math.min(1, value));
}

/**
 * A state-only manual WorldControlSource.
 *
 * It stores normalized requests and turns them into ControlSignals at the
 * WorldRuntime boundary. It has no Entity, physics, or outcome access.
 */
export class ManualControlSource {
  private readonly values = new Map<string, ManualControlValue>();

  /** A WorldControlSource suitable for SpawnOptions.control. */
  readonly control: WorldControlSource = (_seconds, _tick) => this.generateSignals();

  /** Store a request, clamping Joint to [-1, 1] and Tension to [0, 1]. */
  set(actuatorId: string, kind: ManualControlKind, value: number): void {
    const id = requireActuatorId(actuatorId);
    this.values.set(id, { kind, value: clampValue(id, kind, value) });
  }

  /** Read a request; an actuator with no stored request is neutral. */
  get(actuatorId: string): number {
    return this.values.get(requireActuatorId(actuatorId))?.value ?? 0;
  }

  /** Remove one stored request. */
  delete(actuatorId: string): void {
    this.values.delete(requireActuatorId(actuatorId));
  }

  /** Remove every stored request. */
  clear(): void {
    this.values.clear();
  }

  /** Emit fresh ControlSignals through the canonical signal factory. */
  private generateSignals(): readonly ControlSignal[] {
    return [...this.values].map(([actuatorId, entry]) => createControlSignal(
      actuatorId,
      entry.value,
    ));
  }
}
