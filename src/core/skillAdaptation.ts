/** Evidence supplied by completed, perception-based Skill attempts. */
export interface AdaptationEvidence {
  readonly parameters: { readonly amplitude: number; readonly phaseOffset: number };
  readonly predictedProgress: number;
  readonly observedProgress: number;
  readonly confidence: number;
}

export interface ParameterAdjustment {
  readonly amplitude: number;
  readonly phaseOffset: number;
  readonly reason: string;
}

/**
 * Small deterministic search step after repeated underperformance. This policy
 * knows neither body structure nor the cause of the error. A parameter change
 * requires two completed attempts at the current parameters, so ordinary
 * single-window variation does not continuously move the motor primitive.
 */
export class SkillAdaptationPolicy {
  adjust(
    current: { readonly amplitude: number; readonly phaseOffset: number },
    recent: readonly AdaptationEvidence[],
  ): ParameterAdjustment | null {
    const tail = recent.slice(-2);
    if (tail.length < 2 || tail.some((item) => item.confidence < 0.5
      || Math.abs(item.parameters.amplitude - current.amplitude) > 1e-9
      || Math.abs(item.parameters.phaseOffset - current.phaseOffset) > 1e-9)) return null;
    const surprised = tail.every((item) => {
      const threshold = Math.max(0.015, Math.abs(item.predictedProgress) * 0.25);
      return item.observedProgress < item.predictedProgress - threshold;
    });
    if (!surprised) return null;
    if (current.amplitude < 0.999) {
      return { amplitude: Math.min(1, Math.round((current.amplitude + 0.08) * 100) / 100),
        phaseOffset: current.phaseOffset, reason: 'repeated negative progress prediction error' };
    }
    if (current.phaseOffset < 0.6) {
      return { amplitude: current.amplitude,
        phaseOffset: Math.min(0.6, Math.round((current.phaseOffset + 0.15) * 100) / 100),
        reason: 'repeated negative progress prediction error' };
    }
    return null;
  }
}
