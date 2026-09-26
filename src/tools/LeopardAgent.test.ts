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

function bodyView(tick: number, range?: number, side = 0, flipped = false,
  contacts: readonly string[] = []): AgentPerceptionView {
  const perceptions: SensorPerception[] = [
    sample(tick, 'orientation', flipped ? [1, 0, 0, 0] : [0, 0, 0, 1], 'leopard-torso-proprioception'),
    sample(tick, 'angular-velocity', [0, 0, 0], 'leopard-torso-proprioception'),
    sample(tick, 'local-velocity', [0, 0, 0], 'leopard-torso-proprioception'),
  ];
  for (const connectionId of [
    'leopard-spine-joint',
    'leopard-front-left-hip-joint', 'leopard-front-right-hip-joint',
    'leopard-hind-left-hip-joint', 'leopard-hind-right-hip-joint',
  ]) {
    perceptions.push({ ...sample(tick, 'joint', [0, 0, 0, 0, 0, 0], 'leopard-torso-proprioception'),
      ownConnectionId: connectionId });
  }
  for (const connectionId of [
    'leopard-front-left-knee-joint', 'leopard-front-right-knee-joint',
    'leopard-hind-left-knee-joint', 'leopard-hind-right-knee-joint',
    'leopard-front-left-paw', 'leopard-front-right-paw',
    'leopard-hind-left-paw', 'leopard-hind-right-paw',
    'leopard-neck-joint', 'leopard-jaw-joint',
  ]) {
    perceptions.push({ ...sample(tick, 'joint', [0, 0], 'leopard-torso-proprioception'),
      ownConnectionId: connectionId });
  }
  if (range !== undefined) perceptions.push(sample(tick, 'range', [1, 0, side, range], 'leopard-head-range'));
  for (const part of contacts) {
    perceptions.push(sample(tick, 'contact', [0, 0, 0, 0], `leopard-${part}-paw-contact`));
  }
  return { tick, perceptions };
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

  it('uses spherical shoulder and hip coordinates for turning and anonymous reach', () => {
    const turning = new LeopardAgentRuntime();
    const turnSignals = turning.control(bodyView(1), 1 / 60);
    const turnById = new Map(turnSignals.map((signal) => [signal.actuatorId, signal.value]));
    expect(turning.inspect().skill).toBe('turn');
    expect(turnById.get('leopard-front-left-hip-roll')).not.toBe(turnById.get('leopard-front-right-hip-roll'));
    expect(turnById.get('leopard-front-left-hip-yaw')).toBeDefined();
    expect(turnById.get('leopard-hind-right-hip-yaw')).toBeDefined();

    const reaching = new LeopardAgentRuntime();
    const reachSignals = reaching.control(bodyView(1, 0.3, 0.8), 1 / 60);
    const reachById = new Map(reachSignals.map((signal) => [signal.actuatorId, signal.value]));
    expect(reaching.inspect().skill).toBe('interact');
    expect(reachById.get('leopard-front-left-hip-roll')).not.toBe(reachById.get('leopard-front-right-hip-roll'));
    expect(reachById.get('leopard-front-left-hip-yaw')).toBeDefined();
    expect(reachById.get('leopard-front-right-hip-yaw')).toBeDefined();
    expect(reachById.get('leopard-jaw-close')).toBeGreaterThan(0);

    const supported = new LeopardAgentRuntime();
    const free = new LeopardAgentRuntime();
    const supportedSignals = supported.control(bodyView(1, undefined, 0, true, ['front-left']), 1 / 60);
    const freeSignals = free.control(bodyView(1, undefined, 0, true), 1 / 60);
    const supportedAnkle = supportedSignals.find((signal) => signal.actuatorId === 'leopard-front-left-ankle')?.value;
    const freeAnkle = freeSignals.find((signal) => signal.actuatorId === 'leopard-front-left-ankle')?.value;
    expect(supportedAnkle).toBeLessThan(freeAnkle ?? 1);
  });
});
