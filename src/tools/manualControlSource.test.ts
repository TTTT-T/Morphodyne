import { describe, expect, it } from 'vitest';
import type { ControlSignal } from '../core/actuation';
import { ManualControlSource } from './ManualControlSource';

describe('ManualControlSource', () => {
  it('emits only normalized ControlSignals for arbitrary actuator IDs', () => {
    const source = new ManualControlSource();
    source.set('joint-any-id', 'joint', 4);
    source.set('tension-any-id', 'tension', -2);
    source.set('new-actuator-id', 'joint', 0.25);

    const signals: readonly ControlSignal[] = source.control(1 / 60, 12);
    expect(signals).toEqual([
      { actuatorId: 'joint-any-id', value: 1 },
      { actuatorId: 'tension-any-id', value: 0 },
      { actuatorId: 'new-actuator-id', value: 0.25 },
    ]);
  });

  it('keeps tension controls nonnegative and joint controls signed', () => {
    const source = new ManualControlSource();
    source.set('cable', 'tension', 0.75);
    source.set('hinge', 'joint', -1.5);

    expect(source.control(0, 0)).toEqual([
      { actuatorId: 'cable', value: 0.75 },
      { actuatorId: 'hinge', value: -1 },
    ]);
    source.set('cable', 'tension', 2);
    expect(source.control(0, 0)).toEqual([
      { actuatorId: 'cable', value: 1 },
      { actuatorId: 'hinge', value: -1 },
    ]);
  });

  it('supports removing and clearing requests without mutating a world or physics object', () => {
    const source = new ManualControlSource();
    source.set('joint', 'joint', 0.5);
    source.set('tension', 'tension', 0.5);
    expect(source.get('joint')).toBe(0.5);
    expect(source.get('missing')).toBe(0);
    source.delete('joint');
    expect(source.control(0, 0)).toEqual([{ actuatorId: 'tension', value: 0.5 }]);

    source.set('joint', 'joint', 0.5);
    source.delete('joint');
    source.clear();
    expect(source.control(0, 0)).toEqual([]);
  });

  it('rejects non-finite requests before creating a signal', () => {
    const source = new ManualControlSource();
    expect(() => source.set('joint', 'joint', Number.NaN)).toThrow('Invalid manual control value: joint');
    expect(() => source.set('joint', 'joint', Number.POSITIVE_INFINITY)).toThrow('Invalid manual control value: joint');
  });
});
