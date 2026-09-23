import type {
  OwnJointEstimate,
  SelfModel,
  StabilityEstimate,
  VectorEstimate,
  WorldModel,
} from './brainModels';
import type { Goal, GoalKind } from './brainPolicy';

/** The short horizon used by the first forward skill model. */
export const DEFAULT_FORWARD_DURATION_SECONDS = 0.5;
/** A deliberately small bounded history for the first adaptation loop. */
export const DEFAULT_EXPERIENCE_LIMIT = 30;

const TAU = 2 * Math.PI;
const FORWARD_MOTOR_RESPONSE_METERS_PER_SECOND = 0.8;
const CONTACT_MEMORY_TICKS = 30;

/**
 * Phase 6 initially only tunes the motor primitive's amplitude and phase.
 * These values describe an attempt; they are not a promise of displacement.
 */
export interface ForwardSkillParameters {
  readonly amplitude: number;
  readonly phaseOffset: number;
}

/** A local velocity sample supplied by proprioceptive perception. */
export interface ForwardVelocitySample {
  readonly localVelocity: VectorEstimate | null;
  readonly durationSeconds: number;
}

/**
 * BrainModels gains localVelocity during Phase 6.  The optional intersection
 * keeps this module usable while callers migrate, without inventing a value
 * when the perception pipeline has not supplied one.
 */
export type SkillSelfModel = SelfModel & {
  readonly localVelocity?: VectorEstimate | null;
};

/** The perception-only part of Self Model retained by an Experience. */
export interface SelfModelSnapshot {
  readonly tick: number;
  readonly localVelocity: VectorEstimate | null;
  readonly orientation: VectorEstimate | null;
  readonly angularVelocity: VectorEstimate | null;
  readonly joints: readonly OwnJointEstimate[];
  readonly stability: StabilityEstimate;
  readonly observedSensorIds: readonly string[];
  readonly proprioceptionAvailable: boolean;
  readonly feedbackGapRecent: boolean;
}

/** Predicted short-horizon quantities, expressed in agent-observable units. */
export interface ForwardPrediction {
  /** Expected displacement along the agent's local forward (-Z) axis, in metres. */
  readonly forwardProgress: number;
  readonly confidence: number;
  /** Expected stability score in [0, 1], when the caller uses the richer model. */
  readonly stability?: number;
  readonly durationSeconds?: number;
}

/** Result reconstructed from before/after perception, never from Physics. */
export interface ForwardObservedResult {
  /** Observed displacement along local forward (-Z), in metres. */
  readonly forwardProgress: number;
  readonly confidence: number;
  /** Observed stability score in [0, 1], when available from proprioception. */
  readonly stability?: number;
  readonly durationSeconds?: number;
  readonly sampleCount: number;
}

export type ForwardObservation = ForwardObservedResult;

/** Discrepancy is observed minus predicted, so a negative progress error is underperformance. */
export interface ForwardPredictionError {
  readonly forwardProgress: number;
  readonly stability?: number;
  readonly magnitude?: number;
  readonly confidence?: number;
}

export type PredictionError = ForwardPredictionError;

/** Small Self Model summary retained in the public Experience record. */
export interface SelfModelSummary {
  readonly stability: SelfModel['stability']['level'];
  readonly localVelocity: readonly number[] | null;
  readonly observedJoints: number;
}

/** One complete forward attempt retained by the bounded Experience cache. */
export interface ForwardExperience {
  readonly goal: GoalKind;
  readonly skill: 'forward';
  readonly parameters: ForwardSkillParameters;
  readonly selfSummary: SelfModelSummary;
  readonly prediction: ForwardPrediction;
  readonly observed: ForwardObservedResult;
  readonly error: ForwardPredictionError;
  readonly confidence: number;
  readonly tick: number;
  readonly durationSeconds: number;
  readonly timeSeconds?: number;
  /** Rich aliases for callers that need the full copied proprioceptive snapshot. */
  readonly selfModel: SelfModelSnapshot;
  readonly observation: ForwardObservedResult;
}

/** Immutable, finite history used by prediction and adaptation. */
export interface ExperienceCache {
  readonly limit: number;
  /** Alias retained for callers that prefer the generic cache vocabulary. */
  readonly entries: readonly ForwardExperience[];
  readonly experiences: readonly ForwardExperience[];
}

export interface CreateForwardExperienceInput {
  readonly goal: Goal | GoalKind;
  readonly parameters: ForwardSkillParameters;
  readonly beforeSelf: SkillSelfModel;
  readonly prediction: ForwardPrediction;
  readonly observation: ForwardObservation;
  readonly tick: number;
  readonly timeSeconds: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function nonnegativeDuration(value: number, label: string): number {
  finite(value, label);
  if (value < 0) throw new Error(`${label} must be nonnegative`);
  return value;
}

function wrappedPhase(value: number): number {
  const wrapped = ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return wrapped === Math.PI ? -Math.PI : wrapped;
}

/** Clamp motor amplitude and wrap phase without changing the caller's object. */
export function normalizeForwardSkillParameters(parameters: ForwardSkillParameters): ForwardSkillParameters {
  finite(parameters.amplitude, 'Forward amplitude');
  finite(parameters.phaseOffset, 'Forward phase offset');
  return { amplitude: clamp01(parameters.amplitude), phaseOffset: wrappedPhase(parameters.phaseOffset) };
}

/** Create the stable initial parameter set used by a forward attempt. */
export function createForwardSkillParameters(
  parameters: Partial<ForwardSkillParameters> = {},
): ForwardSkillParameters {
  return normalizeForwardSkillParameters({ amplitude: parameters.amplitude ?? 0.6, phaseOffset: parameters.phaseOffset ?? 0 });
}

function copyVector(estimate: VectorEstimate | null | undefined): VectorEstimate | null {
  return estimate
    ? { value: [...estimate.value], confidence: clamp01(estimate.confidence), observedTick: estimate.observedTick }
    : null;
}

function copyStability(stability: StabilityEstimate): StabilityEstimate {
  return { level: stability.level, confidence: clamp01(stability.confidence) };
}

/** Copy the perception-derived state needed to explain one later adjustment. */
export function snapshotSelfModel(self: SkillSelfModel): SelfModelSnapshot {
  return {
    tick: self.tick,
    localVelocity: copyVector(self.localVelocity),
    orientation: copyVector(self.orientation),
    angularVelocity: copyVector(self.angularVelocity),
    joints: self.joints.map((joint) => ({
      connectionId: joint.connectionId,
      value: [...joint.value],
      confidence: clamp01(joint.confidence),
      observedTick: joint.observedTick,
    })),
    stability: copyStability(self.stability),
    observedSensorIds: [...self.observedSensorIds],
    proprioceptionAvailable: self.proprioceptionAvailable,
    feedbackGapRecent: self.feedbackGapRecent,
  };
}

function forwardRate(localVelocity: VectorEstimate | null | undefined): number | null {
  if (!localVelocity || localVelocity.value.length < 3) return null;
  const z = localVelocity.value[2];
  return Number.isFinite(z) ? -z : null;
}

function stabilityScore(stability: StabilityEstimate): number {
  switch (stability.level) {
    case 'stable': return 1;
    case 'unstable': return 0;
    case 'uncertain': return 0.5;
    case 'unknown': return 0.5;
  }
}

function currentWorldConfidence(world: WorldModel): number {
  const recentObservation = world.lastObservationTick === null
    ? 0.5
    : clamp01(1 - Math.max(0, world.tick - world.lastObservationTick) / CONTACT_MEMORY_TICKS);
  const rangeConfidence = world.ranges.length === 0
    ? 0.5
    : world.ranges.reduce((sum, range) => sum + clamp01(range.confidence), 0) / world.ranges.length;
  const contactConfidence = world.contact.lastSeenTick === null ? 0.5 : clamp01(world.contact.confidence);
  return clamp01((recentObservation + rangeConfidence + contactConfidence) / 3);
}

function recentRate(experiences: readonly ForwardExperience[]): { rate: number; confidence: number } | null {
  let weightedRate = 0;
  let weight = 0;
  for (const experience of experiences) {
    const duration = experience.observed.durationSeconds ?? experience.durationSeconds;
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const confidence = clamp01(experience.confidence);
    weightedRate += (experience.observed.forwardProgress / duration) * confidence;
    weight += confidence;
  }
  return weight > 0 ? { rate: weightedRate / weight, confidence: clamp01(weight / experiences.length) } : null;
}

/**
 * Predict the result of one short forward attempt from estimates available to
 * the Agent.  No physics body, damage state, transform, or future result is
 * accepted by this function.
 */
export function predictForward(
  self: SkillSelfModel,
  world: WorldModel,
  parameters: ForwardSkillParameters,
  recentExperiences: readonly ForwardExperience[] = [],
  durationSeconds = DEFAULT_FORWARD_DURATION_SECONDS,
): ForwardPrediction {
  const duration = nonnegativeDuration(durationSeconds, 'Forward prediction duration');
  const normalized = normalizeForwardSkillParameters(parameters);
  const currentRate = forwardRate(self.localVelocity);
  const phaseEfficiency = Math.cos(normalized.phaseOffset);
  const contactFactor = world.contact.lastSeenTick === null ? 0.85 : 1;
  const modelRate = (currentRate ?? 0) + normalized.amplitude
    * FORWARD_MOTOR_RESPONSE_METERS_PER_SECOND * phaseEfficiency * contactFactor;
  const matchingHistory = recentExperiences.filter((experience) =>
    Math.abs(experience.parameters.amplitude - normalized.amplitude) <= 1e-6
    && Math.abs(wrappedPhase(experience.parameters.phaseOffset) - normalized.phaseOffset) <= 1e-6);
  const history = recentRate(matchingHistory.length > 0 ? matchingHistory : recentExperiences);
  // Once a parameter setting has evidence, its measured response is the
  // strongest predictor. A small model contribution keeps a new body state or
  // a newly selected parameter from being frozen to an old average.
  const predictedRate = history === null ? modelRate : history.rate * 0.8 + modelRate * 0.2;
  const currentStability = stabilityScore(self.stability);
  const historyStabilityError = recentExperiences.length === 0
    ? 0
    : recentExperiences.reduce((sum, experience) => sum + (experience.error.stability ?? 0) * experience.confidence, 0)
      / Math.max(1, recentExperiences.reduce((sum, experience) => sum + experience.confidence, 0));
  const predictedStability = clamp01(currentStability - normalized.amplitude * 0.15 + historyStabilityError * 0.2);
  const velocityConfidence = self.localVelocity ? clamp01(self.localVelocity.confidence) : 0;
  const historyConfidence = history?.confidence ?? 0;
  const confidence = clamp01((velocityConfidence * 0.4 + clamp01(self.stability.confidence) * 0.3
    + historyConfidence * 0.15 + currentWorldConfidence(world) * 0.15));
  return {
    forwardProgress: predictedRate * duration,
    confidence,
    stability: predictedStability,
    durationSeconds: duration,
  };
}

/** Integrate only perception-derived local velocity samples into displacement. */
export function integrateForwardProgress(
  samples: readonly ForwardVelocitySample[],
): { readonly forwardProgress: number; readonly durationSeconds: number; readonly confidence: number; readonly sampleCount: number } {
  let progress = 0;
  let duration = 0;
  let weightedConfidence = 0;
  let observedSamples = 0;
  for (const sample of samples) {
    const sampleDuration = nonnegativeDuration(sample.durationSeconds, 'Forward velocity sample duration');
    if (sampleDuration === 0) continue;
    duration += sampleDuration;
    const rate = forwardRate(sample.localVelocity);
    if (rate === null) continue;
    progress += rate * sampleDuration;
    weightedConfidence += clamp01(sample.localVelocity?.confidence ?? 0) * sampleDuration;
    observedSamples += 1;
  }
  return {
    forwardProgress: progress,
    durationSeconds: duration,
    confidence: duration > 0 ? clamp01(weightedConfidence / duration) : 0,
    sampleCount: observedSamples,
  };
}

/** Convert before/after Self Models (and optionally per-tick samples) to an observed result. */
export function observeForward(
  progressFromIntegratedPerception: number,
  confidence: number,
): ForwardObservedResult;
export function observeForward(
  beforeSelf: SkillSelfModel,
  afterSelf: SkillSelfModel,
  durationSeconds?: number,
  velocitySamples?: readonly ForwardVelocitySample[],
): ForwardObservedResult;
export function observeForward(
  beforeOrProgress: SkillSelfModel | number,
  afterOrConfidence: SkillSelfModel | number,
  durationSeconds = DEFAULT_FORWARD_DURATION_SECONDS,
  velocitySamples: readonly ForwardVelocitySample[] = [],
): ForwardObservedResult {
  if (typeof beforeOrProgress === 'number' && typeof afterOrConfidence === 'number') {
    finite(beforeOrProgress, 'Observed forward progress');
    finite(afterOrConfidence, 'Observed confidence');
    return {
      forwardProgress: beforeOrProgress,
      confidence: clamp01(afterOrConfidence),
      durationSeconds: DEFAULT_FORWARD_DURATION_SECONDS,
      sampleCount: 0,
    };
  }
  if (typeof beforeOrProgress === 'number' || typeof afterOrConfidence === 'number') {
    throw new Error('Forward observation requires both Self Models or numeric progress and confidence');
  }
  const beforeSelf = beforeOrProgress;
  const afterSelf = afterOrConfidence;
  const requestedDuration = nonnegativeDuration(durationSeconds, 'Forward observation duration');
  const integrated = velocitySamples.length > 0 ? integrateForwardProgress(velocitySamples) : null;
  const beforeRate = forwardRate(beforeSelf.localVelocity);
  const afterRate = forwardRate(afterSelf.localVelocity);
  const endpointProgress = beforeRate === null || afterRate === null
    ? 0
    : ((beforeRate + afterRate) / 2) * requestedDuration;
  const endpointConfidence = beforeSelf.localVelocity && afterSelf.localVelocity
    ? (clamp01(beforeSelf.localVelocity.confidence) + clamp01(afterSelf.localVelocity.confidence)) / 2
    : 0;
  const hasIntegratedEvidence = integrated !== null && integrated.sampleCount > 0;
  const progress = hasIntegratedEvidence ? integrated.forwardProgress : endpointProgress;
  const observedDuration = hasIntegratedEvidence && integrated.durationSeconds > 0
    ? integrated.durationSeconds
    : requestedDuration;
  const progressConfidence = hasIntegratedEvidence ? integrated.confidence : endpointConfidence;
  const stabilityConfidence = (clamp01(beforeSelf.stability.confidence) + clamp01(afterSelf.stability.confidence)) / 2;
  const stability = (stabilityScore(beforeSelf.stability) + stabilityScore(afterSelf.stability)) / 2;
  return {
    forwardProgress: progress,
    stability,
    confidence: clamp01((progressConfidence + stabilityConfidence) / 2),
    durationSeconds: observedDuration,
    sampleCount: hasIntegratedEvidence ? integrated.sampleCount : (beforeRate !== null && afterRate !== null ? 2 : 0),
  };
}

/** Compute observed minus predicted error for an attempt. */
export function computePredictionError(
  prediction: ForwardPrediction,
  observation: ForwardObservedResult,
): ForwardPredictionError {
  const forwardProgress = observation.forwardProgress - prediction.forwardProgress;
  const stability = (observation.stability ?? 0.5) - (prediction.stability ?? 0.5);
  return {
    forwardProgress,
    stability,
    magnitude: Math.hypot(forwardProgress, stability),
    confidence: clamp01(Math.min(prediction.confidence, observation.confidence)),
  };
}

/** Short alias used by the runtime integration. */
export const predictionError = computePredictionError;

/** Assemble a complete immutable attempt record without adding world truth. */
export function createForwardExperience(input: CreateForwardExperienceInput): ForwardExperience {
  finite(input.tick, 'Experience tick');
  finite(input.timeSeconds, 'Experience time');
  const parameters = normalizeForwardSkillParameters(input.parameters);
  const prediction = { ...input.prediction };
  const observed = { ...input.observation };
  const error = computePredictionError(prediction, observed);
  const confidence = clamp01(Math.min(prediction.confidence, observed.confidence));
  const selfModel = snapshotSelfModel(input.beforeSelf);
  return {
    goal: typeof input.goal === 'string' ? input.goal : input.goal.kind,
    skill: 'forward',
    parameters,
    selfSummary: {
      stability: selfModel.stability.level,
      localVelocity: selfModel.localVelocity ? [...selfModel.localVelocity.value] : null,
      observedJoints: selfModel.joints.length,
    },
    prediction,
    observed,
    error,
    confidence,
    tick: input.tick,
    durationSeconds: observed.durationSeconds ?? prediction.durationSeconds ?? DEFAULT_FORWARD_DURATION_SECONDS,
    timeSeconds: input.timeSeconds,
    selfModel,
    observation: observed,
  };
}

/** Create an empty bounded Experience cache. */
export function createExperienceCache(limit = DEFAULT_EXPERIENCE_LIMIT): ExperienceCache {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Experience cache limit must be a positive integer');
  const experiences: readonly ForwardExperience[] = [];
  return { limit, entries: experiences, experiences };
}

/** Add one attempt and retain only the newest bounded window. */
export function record(cache: ExperienceCache, experience: ForwardExperience): ExperienceCache {
  if (!Number.isInteger(cache.limit) || cache.limit < 1) throw new Error('Experience cache limit must be a positive integer');
  const experiences = [...cache.experiences, experience].slice(-cache.limit);
  return { limit: cache.limit, entries: experiences, experiences };
}
