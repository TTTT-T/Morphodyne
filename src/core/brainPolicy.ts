import type { SelfModel, WorldModel } from './brainModels';

/** Internal tendencies are scores, not actuator commands. */
export interface DriveState {
  readonly maintain: number;
  readonly avoid: number;
  readonly acquire: number;
  readonly explore: number;
}

export type GoalKind =
  | 'maintain-stability'
  | 'increase-distance'
  | 'investigate-unknown-return'
  | 'continue-exploration';

export interface Goal {
  readonly kind: GoalKind;
  /** A desired condition, deliberately free of pose/control instructions. */
  readonly desiredState: string;
}

export type SkillName = 'stand' | 'forward' | 'turn';

/** A locally perceived opportunity to attempt a motor primitive. */
export interface Affordance {
  readonly id: string;
  readonly goalKind: GoalKind;
  readonly skill: SkillName;
  readonly parameters?: { readonly turn: number };
}

export interface DecisionPolicyInput {
  readonly selfModel: SelfModel;
  readonly worldModel: WorldModel;
  readonly drives: DriveState;
  readonly affordances: readonly Affordance[];
}

export interface Decision {
  readonly goal: Goal;
  readonly affordance: Affordance;
}

/** Replaceable policy boundary. Implementations receive only perception-derived models. */
export interface DecisionPolicy {
  evaluate(input: DecisionPolicyInput): Decision;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const RANGE_NEAR_METERS = 1.8;
const TURN_ATTEMPT = 0.5;

function currentRanges(world: WorldModel): WorldModel['ranges'] {
  return world.ranges.filter((sample) => sample.expiresAtTick >= world.tick && sample.confidence > 0);
}

/** Derive bounded, non-actuating tendencies from the agent's current estimates. */
export function deriveDrives(self: SelfModel, world: WorldModel): DriveState {
  const stability = self.stability.level;
  const maintain = stability === 'unstable' ? 0.95
    : self.feedbackGapRecent ? 0.9
    : stability === 'uncertain' ? 0.45
      : stability === 'stable' ? 0.1 : 0.3;
  const ranges = currentRanges(world);
  const nearestConfidence = ranges.reduce((value, sample) => sample.distance < RANGE_NEAR_METERS
    ? Math.max(value, clamp01(sample.confidence) * (0.65 + 0.35 * (RANGE_NEAR_METERS - sample.distance) / RANGE_NEAR_METERS))
    : value, 0);
  const avoid = clamp01(nearestConfidence);
  const acquire = 0.05;
  const explore = ranges.length === 0 ? 0.65 : 0.25;
  return { maintain, avoid, acquire, explore };
}

/**
 * Advertise generic attempts available to this simple policy. These are
 * affordances, not promises that the current body can complete them.
 */
export function createAffordances(self: SelfModel, world: WorldModel): readonly Affordance[] {
  const options: Affordance[] = [{ id: 'stand', goalKind: 'maintain-stability', skill: 'stand' }];
  const turnMagnitude = self.stability.level === 'uncertain' ? 0.35 : TURN_ATTEMPT;
  const ranges = currentRanges(world);
  const closeReturn = ranges.filter((sample) => sample.distance < RANGE_NEAR_METERS)
    .sort((a, b) => a.distance - b.distance)[0];
  if (closeReturn) {
    // Positive local x points right: turn in the opposite direction. A centered
    // return has no evidence for a side, so the stable tie-break is left.
    const turn = closeReturn.localDirection[0] > 0.05 ? -turnMagnitude : turnMagnitude;
    options.push({ id: 'increase-distance-turn', goalKind: 'increase-distance', skill: 'turn', parameters: { turn } });
  } else {
    options.push({ id: 'explore-forward', goalKind: 'continue-exploration', skill: 'forward' });
    if (ranges.length > 0) options.push({ id: 'investigate-turn', goalKind: 'investigate-unknown-return', skill: 'turn', parameters: { turn: turnMagnitude } });
  }
  return options;
}

const GOALS: Readonly<Record<GoalKind, Goal>> = {
  'maintain-stability': { kind: 'maintain-stability', desiredState: 'stable posture' },
  'increase-distance': { kind: 'increase-distance', desiredState: 'greater distance from a nearby surface' },
  'investigate-unknown-return': { kind: 'investigate-unknown-return', desiredState: 'more information about an unknown return' },
  'continue-exploration': { kind: 'continue-exploration', desiredState: 'new local observations' },
};

/** Deterministic short-horizon policy; physics remains responsible for outcomes. */
export class RuleDecisionPolicy implements DecisionPolicy {
  evaluate(input: DecisionPolicyInput): Decision {
    const { drives, affordances } = input;
    const priority: readonly [GoalKind, number][] = [
      ['maintain-stability', drives.maintain],
      ['increase-distance', drives.avoid],
      ['investigate-unknown-return', drives.acquire],
      ['continue-exploration', drives.explore],
    ];
    const available = [...priority].sort((a, b) => b[1] - a[1])
      .map(([goalKind]) => ({ goalKind, affordance: affordances.find((option) => option.goalKind === goalKind) }))
      .find((option) => option.affordance);
    if (!available?.affordance) throw new Error('No available affordance');
    const { goalKind, affordance } = available;
    return { goal: GOALS[goalKind], affordance };
  }
}
