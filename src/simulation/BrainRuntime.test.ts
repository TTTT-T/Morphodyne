import { describe, expect, it } from 'vitest';
import type { AgentPerceptionView, SensorPerception } from '../core/sensing';
import type { DecisionPolicy } from '../core/brainPolicy';
import { BrainRuntime, skillIntentToControlIntent } from './BrainRuntime';

function sample(tick: number, channel: SensorPerception['channel'], values: readonly number[], sensorId = 'internal'): SensorPerception {
  return { tick, expiresAtTick: tick + 3, sensorId, channel, label: channel,
    confidence: 1, values, uncertainty: values.map(() => 0) };
}

function view(tick: number, range: boolean): AgentPerceptionView {
  return { tick, perceptions: [
    sample(tick, 'orientation', [0, 0, 0, 1]),
    sample(tick, 'angular-velocity', [0, 0, 0]),
    sample(tick, 'contact', [0, 0, 0, 1], 'touch'),
    ...(range ? [sample(tick, 'range', [0, 0, -1, 1.5], 'range')] : []),
  ] };
}

describe('BrainRuntime', () => {
  it('decides at 10 Hz from perception and switches attempts when an unknown return disappears', () => {
    const brain = new BrainRuntime();
    const first = brain.update(view(0, true));
    expect(first.worldModel.ranges).toHaveLength(1);
    expect(first.decision?.goal.kind).toBe('increase-distance');
    expect(first.skillIntent.skill).toBe('turn');
    const between = brain.update(view(1, false));
    expect(between.worldModel.ranges).toHaveLength(0);
    expect(between.skillIntent.skill).toBe('turn'); // prior decision held until next decision step
    const next = brain.update(view(6, false));
    expect(next.drives.avoid).toBe(0);
    expect(next.decision?.goal.kind).toBe('continue-exploration');
    expect(next.skillIntent.skill).toBe('forward');
    expect(skillIntentToControlIntent(next.skillIntent)).toEqual({ forward: 1, turn: 0 });
  });

  it('accepts a replaceable policy without any physical runtime input', () => {
    let calls = 0;
    const policy: DecisionPolicy = { evaluate(input) {
      calls++;
      return { goal: { kind: 'maintain-stability', desiredState: 'stable posture' },
        affordance: input.affordances.find((option) => option.skill === 'stand')! };
    } };
    const brain = new BrainRuntime(policy, 6);
    for (let tick = 0; tick <= 12; tick++) brain.update(view(tick, true));
    expect(calls).toBe(3);
    expect(skillIntentToControlIntent(brain.update(view(12, true)).skillIntent)).toEqual({ forward: 0, turn: 0 });
  });
});
