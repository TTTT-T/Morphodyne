import { describe, expect, it } from 'vitest';
import { SkillAdaptationPolicy } from './skillAdaptation';

describe('SkillAdaptationPolicy', () => {
  const policy = new SkillAdaptationPolicy();
  const parameters = { amplitude: 0.6, phaseOffset: 0 };
  const evidence = (observedProgress: number) => ({ parameters, predictedProgress: 0.1,
    observedProgress, confidence: 1 });

  it('holds parameters through calibrated or isolated errors', () => {
    expect(policy.adjust(parameters, [evidence(0.03)])).toBeNull();
    expect(policy.adjust(parameters, [evidence(0.03), evidence(0.09)])).toBeNull();
  });

  it('changes a motor parameter only after repeated errors at the same setting', () => {
    expect(policy.adjust(parameters, [evidence(0.03), evidence(0.02)]))
      .toMatchObject({ amplitude: 0.68, phaseOffset: 0 });
    expect(policy.adjust({ amplitude: 0.68, phaseOffset: 0 },
      [evidence(0.03), evidence(0.02)])).toBeNull();
  });
});
