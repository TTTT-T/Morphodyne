import {
  createExperienceCache, createForwardExperience, createForwardSkillParameters,
  observeForward, predictForward, record,
  type ExperienceCache, type ForwardPrediction, type ForwardExperience,
  type ForwardSkillParameters, type ForwardVelocitySample,
} from '../core/skillLearning';
import { SkillAdaptationPolicy, type ParameterAdjustment } from '../core/skillAdaptation';
import type { SelfModel } from '../core/brainModels';
import type { Goal } from '../core/brainPolicy';
import type { ControlIntent } from './ActiveBodyController';
import { skillIntentToControlIntent, type BrainSnapshot } from './BrainRuntime';

interface PendingAttempt {
  readonly startTick: number;
  readonly beforeSelf: SelfModel;
  readonly goal: Goal;
  readonly parameters: ForwardSkillParameters;
  readonly prediction: ForwardPrediction;
  readonly samples: ForwardVelocitySample[];
}

export interface SkillRuntimeSnapshot {
  readonly control: ControlIntent;
  readonly parameters: ForwardSkillParameters;
  readonly prediction: ForwardPrediction | null;
  readonly lastExperience: ForwardExperience | null;
  readonly adaptationCount: number;
  readonly lastAdjustment: ParameterAdjustment | null;
  readonly experienceCount: number;
}

/**
 * Owns the short attempt/evaluate/update cycle. The only variable input is a
 * Brain snapshot assembled from AgentPerceptionView; no physics or damage
 * runtime is reachable from here.
 */
export class SkillRuntime {
  private parameters = createForwardSkillParameters();
  private experiences: ExperienceCache = createExperienceCache();
  private readonly policy = new SkillAdaptationPolicy();
  private pending: PendingAttempt | null = null;
  private lastExperience: ForwardExperience | null = null;
  private lastAdjustment: ParameterAdjustment | null = null;
  private adaptationCount = 0;
  private lastTick = -1;

  constructor(private readonly fixedSeconds = 1 / 60, private readonly attemptTicks = 30) {
    if (!Number.isFinite(fixedSeconds) || fixedSeconds <= 0 || !Number.isInteger(attemptTicks) || attemptTicks < 2) {
      throw new Error('Skill attempt requires positive fixed time and at least two ticks');
    }
  }

  cancelAttempt(): void { this.pending = null; }

  update(brain: BrainSnapshot): SkillRuntimeSnapshot {
    const tick = brain.selfModel.tick;
    if (tick < this.lastTick) throw new Error('SkillRuntime requires nondecreasing perception ticks');
    if (tick !== this.lastTick) {
      this.lastTick = tick;
      if (brain.skillIntent.skill !== 'forward' || !brain.decision) {
        this.pending = null;
      } else {
        if (this.pending && tick > this.pending.startTick) {
          this.pending.samples.push({ localVelocity: brain.selfModel.localVelocity, durationSeconds: this.fixedSeconds });
          if (tick - this.pending.startTick >= this.attemptTicks) this.finishAttempt(brain.selfModel, tick);
        }
        if (!this.pending) this.startAttempt(brain, tick);
      }
    }
    const base = skillIntentToControlIntent(brain.skillIntent);
    const control: ControlIntent = brain.skillIntent.skill === 'forward'
      ? { ...base, amplitude: this.parameters.amplitude, phaseOffset: this.parameters.phaseOffset }
      : base;
    return { control, parameters: this.parameters, prediction: this.pending?.prediction ?? null,
      lastExperience: this.lastExperience, adaptationCount: this.adaptationCount,
      lastAdjustment: this.lastAdjustment, experienceCount: this.experiences.experiences.length };
  }

  private startAttempt(brain: BrainSnapshot, tick: number): void {
    const goal = brain.decision?.goal;
    if (!goal) return;
    const parameters = { ...this.parameters };
    const duration = this.fixedSeconds * this.attemptTicks;
    const prediction = predictForward(brain.selfModel, brain.worldModel, parameters,
      this.experiences.experiences, duration);
    this.pending = { startTick: tick, beforeSelf: brain.selfModel, goal, parameters, prediction, samples: [] };
  }

  private finishAttempt(afterSelf: SelfModel, tick: number): void {
    const attempt = this.pending;
    this.pending = null;
    if (!attempt) return;
    const observed = observeForward(attempt.beforeSelf, afterSelf,
      this.fixedSeconds * this.attemptTicks, attempt.samples);
    if (observed.sampleCount < this.attemptTicks / 2) return;
    const experience = createForwardExperience({ goal: attempt.goal, parameters: attempt.parameters,
      beforeSelf: attempt.beforeSelf, prediction: attempt.prediction, observation: observed,
      tick, timeSeconds: tick * this.fixedSeconds });
    this.experiences = record(this.experiences, experience);
    this.lastExperience = experience;
    const adjustment = this.policy.adjust(this.parameters, this.experiences.experiences.map((item) => ({
      parameters: item.parameters, predictedProgress: item.prediction.forwardProgress,
      observedProgress: item.observation.forwardProgress, confidence: item.confidence,
    })));
    if (adjustment) {
      this.parameters = { amplitude: adjustment.amplitude, phaseOffset: adjustment.phaseOffset };
      this.lastAdjustment = adjustment;
      this.adaptationCount += 1;
    }
  }
}
