import { describe, expect, it } from 'vitest';
import type { AgentPerceptionView, SensorPerception } from '../core/sensing';
import { LeopardAgentRuntime } from './LeopardAgent';

function sample(tick: number, channel: SensorPerception['channel'], values: readonly number[], sensorId: string): SensorPerception {
  return { tick, expiresAtTick: tick + 3, channel, values, sensorId,
    label: channel, confidence: 1, uncertainty: values.map(() => 0) };
}

function view(tick: number, range?: number, flipped = false): AgentPerceptionView {
  return { tick, perceptions: [
    sample(tick, 'orientation', flipped ? [1, 0, 0, 0] : [0, 0, 0, 1], 'torso-proprio'),
    sample(tick, 'angular-velocity', [0, 0, 0], 'torso-proprio'),
    { ...sample(tick, 'joint', [0, 0], 'torso-proprio'), ownConnectionId: 'leopard-jaw-joint' },
    ...(range === undefined ? [] : [sample(tick, 'range', [1, 0, 0, range], 'head-range')]),
  ] };
}

describe('independent Leopard decision loop', () => {
  it('selects search, approach, near contact, and posture recovery from only perception', () => {
    const searching = new LeopardAgentRuntime();
    const approaching = new LeopardAgentRuntime();
    const interacting = new LeopardAgentRuntime();
    const recovering = new LeopardAgentRuntime();
    searching.control(view(1), 1 / 60);
    const approachSignals = approaching.control(view(1, 2), 1 / 60);
    const interactSignals = interacting.control(view(1, 0.3), 1 / 60);
    recovering.control(view(1, 0.3, true), 1 / 60);
    expect(searching.inspect().skill).toBe('turn');
    expect(approaching.inspect().skill).toBe('approach');
    expect(interacting.inspect().skill).toBe('interact');
    expect(recovering.inspect().skill).toBe('stand');
    expect(searching.inspect().perceptionTick).toBe(1);
    expect(approaching.inspect().goal).toBe('approach-anonymous-return');
    expect(approachSignals.find((signal) => signal.actuatorId === 'leopard-jaw-close')?.value).toBeLessThan(0);
    expect(interactSignals.find((signal) => signal.actuatorId === 'leopard-jaw-close')?.value).toBeGreaterThan(0);
  });
});
