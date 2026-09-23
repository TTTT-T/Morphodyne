import { describe, expect, it } from 'vitest';
import { createSelfModel, createWorldModel } from './brainModels';
import {
  computePredictionError,
  createExperienceCache,
  createForwardExperience,
  createForwardSkillParameters,
  integrateForwardProgress,
  normalizeForwardSkillParameters,
  observeForward,
  predictForward,
  record,
  type ForwardPrediction,
  type ForwardObservation,
  type SkillSelfModel,
} from './skillLearning';

const goal = { kind: 'continue-exploration' as const, desiredState: 'new local observations' };

function self(overrides: Partial<SkillSelfModel> = {}): SkillSelfModel {
  return {
    ...createSelfModel(),
    localVelocity: { value: [0, 0, -1], confidence: 0.9, observedTick: 1 },
    ...overrides,
  };
}

function prediction(overrides: Partial<ForwardPrediction> = {}): ForwardPrediction {
  return { forwardProgress: 0.4, stability: 0.8, confidence: 0.9, durationSeconds: 0.5, ...overrides };
}

function observation(overrides: Partial<ForwardObservation> = {}): ForwardObservation {
  return { forwardProgress: 0.2, stability: 0.7, confidence: 0.8, durationSeconds: 0.5, sampleCount: 2, ...overrides };
}

describe('perception-based forward skill learning', () => {
  it('normalizes motor parameters at the boundary', () => {
    expect(normalizeForwardSkillParameters({ amplitude: -1, phaseOffset: Math.PI })).toEqual({ amplitude: 0, phaseOffset: -Math.PI });
    expect(createForwardSkillParameters({ amplitude: 2, phaseOffset: 3 * Math.PI })).toEqual({ amplitude: 1, phaseOffset: -Math.PI });
    expect(() => normalizeForwardSkillParameters({ amplitude: Number.NaN, phaseOffset: 0 })).toThrow(/amplitude/);
  });

  it('predicts metres from self/world estimates and changes with skill parameters', () => {
    const selfModel = self();
    const world = { ...createWorldModel(), tick: 1 };
    const baseline = predictForward(selfModel, world, { amplitude: 0.4, phaseOffset: 0 });
    const phaseShift = predictForward(selfModel, world, { amplitude: 0.4, phaseOffset: Math.PI / 2 });
    expect(baseline.durationSeconds).toBe(0.5);
    expect(baseline.forwardProgress).toBeGreaterThan(phaseShift.forwardProgress);
    expect(baseline.confidence).toBeGreaterThan(0);
  });

  it('integrates forward progress only from local velocity samples', () => {
    const integrated = integrateForwardProgress([
      { localVelocity: { value: [0, 0, -2], confidence: 1, observedTick: 1 }, durationSeconds: 0.1 },
      { localVelocity: { value: [0, 0, -1], confidence: 0.5, observedTick: 2 }, durationSeconds: 0.2 },
    ]);
    expect(integrated.forwardProgress).toBeCloseTo(0.4);
    expect(integrated.durationSeconds).toBeCloseTo(0.3);
    expect(integrated.confidence).toBeCloseTo((0.1 + 0.1) / 0.3);
    expect(integrated.sampleCount).toBe(2);
  });

  it('uses perception before and after an attempt to form an observation and error', () => {
    const observed = observeForward(
      self({ localVelocity: { value: [0, 0, 0], confidence: 1, observedTick: 1 } }),
      self({ localVelocity: { value: [0, 0, -0.8], confidence: 1, observedTick: 2 } }),
    );
    expect(observed.forwardProgress).toBeCloseTo(0.2);
    const error = computePredictionError(prediction({ forwardProgress: 0.8 }), observed);
    expect(error.forwardProgress).toBeCloseTo(-0.6);
    expect(error.magnitude).toBeGreaterThan(0.5);
  });

  it('retains a perception snapshot and bounds the experience window', () => {
    const cache = createExperienceCache(2);
    const makeExperience = (tick: number) => createForwardExperience({
      goal,
      parameters: createForwardSkillParameters({ amplitude: tick / 10 }),
      beforeSelf: self({ tick }),
      prediction: prediction(),
      observation: observation(),
      tick,
      timeSeconds: tick / 10,
    });
    const first = makeExperience(1);
    const second = makeExperience(2);
    const third = makeExperience(3);
    const bounded = record(record(record(cache, first), second), third);
    expect(bounded.experiences).toHaveLength(2);
    expect(bounded.experiences.map((item) => item.tick)).toEqual([2, 3]);
    expect(bounded.experiences[0].selfModel).not.toBe(first.selfModel);
    expect(bounded.experiences[0].selfModel.localVelocity).not.toBe(self().localVelocity);
  });

  it('uses recent observed error to calibrate the next prediction', () => {
    const experience = createForwardExperience({
      goal,
      parameters: createForwardSkillParameters(),
      beforeSelf: self(),
      prediction: prediction({ forwardProgress: 0.8 }),
      observation: observation({ forwardProgress: 0.1 }),
      tick: 2,
      timeSeconds: 1,
    });
    const noHistory = predictForward(self(), { ...createWorldModel(), tick: 2 }, { amplitude: 0.4, phaseOffset: 0 });
    const calibrated = predictForward(self(), { ...createWorldModel(), tick: 2 }, { amplitude: 0.4, phaseOffset: 0 }, [experience]);
    expect(calibrated.forwardProgress).toBeLessThan(noHistory.forwardProgress);
  });
});
