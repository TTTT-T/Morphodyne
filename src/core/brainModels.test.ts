import { describe, expect, it } from 'vitest';
import { createSelfModel, createWorldModel, updateSelfModel, updateWorldModel } from './brainModels';
import type { AgentPerceptionView, SensorPerception } from './sensing';

function perception(channel: SensorPerception['channel'], values: number[], fields: Partial<SensorPerception> = {}): SensorPerception {
  return { sensorId: fields.sensorId ?? `${channel}-sensor`, channel, tick: fields.tick ?? 1,
    expiresAtTick: fields.expiresAtTick ?? 3, label: channel, confidence: fields.confidence ?? 0.8,
    values, uncertainty: values.map(() => 0), ...fields };
}

const view = (tick: number, perceptions: SensorPerception[]): AgentPerceptionView => ({ tick, perceptions });

describe('perception-only brain models', () => {
  it('forgets range returns after expiry and sensor removal', () => {
    const first = updateWorldModel(createWorldModel(), view(1, [perception('range', [0, 0, -1, 1.7])]));
    expect(first.ranges).toHaveLength(1);
    expect(first.ranges[0]).toMatchObject({ distance: 1.7, sensorId: 'range-sensor' });
    expect(updateWorldModel(first, view(4, [])).ranges).toEqual([]);
    expect(updateWorldModel(first, view(2, [])).ranges).toEqual([]);
  });

  it('drops proprioceptive self estimates when evidence expires or disappears', () => {
    const populated = updateSelfModel(createSelfModel(), view(1, [
      perception('orientation', [0, 0, 0, 1]),
      perception('angular-velocity', [0, 0, 0]),
      perception('relative-pose', [0, 0, 0, 0, 0, 0, 1], { ownPartId: 'part-a' }),
      perception('joint', [0.2, 0.1], { ownConnectionId: 'joint-a' }),
    ]));
    expect(populated.proprioceptionAvailable).toBe(true);
    expect(populated.parts.map((part) => part.partId)).toEqual(['part-a']);
    expect(populated.joints.map((joint) => joint.connectionId)).toEqual(['joint-a']);

    const lost = updateSelfModel(populated, view(2, []));
    expect(lost.orientation).toBeNull();
    expect(lost.angularVelocity).toBeNull();
    expect(lost.parts).toEqual([]);
    expect(lost.joints).toEqual([]);
    expect(lost.proprioceptionAvailable).toBe(false);
    expect(lost.feedbackGapRecent).toBe(true);
    expect(updateSelfModel(lost, view(33, [])).feedbackGapRecent).toBe(false);
  });

  it('keeps current local velocity and excludes stale velocity evidence', () => {
    const current = updateSelfModel(createSelfModel(), view(2, [
      perception('local-velocity', [0.8, -0.1, 0.2], { tick: 2, expiresAtTick: 3 }),
    ]));
    expect(current.localVelocity).toMatchObject({ value: [0.8, -0.1, 0.2], observedTick: 2 });
    expect(current.proprioceptionAvailable).toBe(true);

    const stale = updateSelfModel(current, view(4, [
      perception('local-velocity', [0.8, -0.1, 0.2], { tick: 2, expiresAtTick: 3 }),
    ]));
    expect(stale.localVelocity).toBeNull();
    expect(stale.proprioceptionAvailable).toBe(false);
  });
});
