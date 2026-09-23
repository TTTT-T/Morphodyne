import { describe, expect, it } from 'vitest';
import { createSelfModel, createWorldModel, type SelfModel, type WorldModel } from './brainModels';
import { createAffordances, deriveDrives, RuleDecisionPolicy } from './brainPolicy';

function inputs(world: WorldModel, self = createSelfModel()) {
  const drives = deriveDrives(self, world);
  const affordances = createAffordances(self, world);
  return { selfModel: self, worldModel: world, drives, affordances };
}

function withRange(world: WorldModel, distance: number, direction: readonly [number, number, number] = [0, 0, 1]): WorldModel {
  return { ...world, ranges: [{ sensorId: 'range-a', localDirection: direction,
    distance, confidence: 1, observedTick: world.tick, expiresAtTick: world.tick + 2 }] };
}

describe('perception-based decision policy', () => {
  const policy = new RuleDecisionPolicy();

  it('avoids a near anonymous return by selecting a bounded turn attempt', () => {
    const world = withRange({ ...createWorldModel(), tick: 10 }, 1.5, [0.4, 0, 0.9]);
    const result = policy.evaluate(inputs(world));
    expect(result.goal.kind).toBe('increase-distance');
    expect(result.affordance.skill).toBe('turn');
    expect(result.affordance.parameters?.turn).toBe(-0.5);
  });

  it('lets missing or expired range evidence select exploration and forward', () => {
    const empty = { ...createWorldModel(), tick: 10 };
    const expired = withRange(empty, 0.3);
    const resultWithoutSensor = policy.evaluate(inputs(empty));
    const resultAfterExpiry = policy.evaluate(inputs({ ...expired, tick: 13 }));
    expect(resultWithoutSensor.goal.kind).toBe('continue-exploration');
    expect(resultWithoutSensor.affordance.skill).toBe('forward');
    expect(resultAfterExpiry.goal.kind).toBe('continue-exploration');
    expect(resultAfterExpiry.affordance.skill).toBe('forward');
  });

  it('prioritizes an estimated instability with a stand attempt', () => {
    const self: SelfModel = { ...createSelfModel(), stability: { level: 'unstable', confidence: 0.9 } };
    const result = policy.evaluate(inputs(withRange({ ...createWorldModel(), tick: 10 }, 0.4), self));
    expect(result.goal.kind).toBe('maintain-stability');
    expect(result.affordance.skill).toBe('stand');
  });
});
