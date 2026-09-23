import { createSelfModel, createWorldModel, updateSelfModel, updateWorldModel,
  type SelfModel, type WorldModel } from '../core/brainModels';
import { createAffordances, deriveDrives, RuleDecisionPolicy,
  type Decision, type DecisionPolicy, type DriveState, type SkillName } from '../core/brainPolicy';
import type { AgentPerceptionView } from '../core/sensing';
import type { ControlIntent } from './ActiveBodyController';

/** A high-level attempt. It contains no actuator signal or physical outcome. */
export interface SkillIntent {
  readonly skill: SkillName;
  readonly turn?: number;
}

export interface BrainSnapshot {
  readonly selfModel: SelfModel;
  readonly worldModel: WorldModel;
  readonly drives: DriveState;
  readonly decision: Decision | null;
  readonly skillIntent: SkillIntent;
}

/** Perception is the only changing input; decision policy can be replaced independently. */
export class BrainRuntime {
  private selfModel = createSelfModel();
  private worldModel = createWorldModel();
  private drives: DriveState = { maintain: 0, avoid: 0, acquire: 0, explore: 0 };
  private decision: Decision | null = null;
  private decidedAtTick = -1;
  private lastViewTick = -1;

  constructor(
    private readonly policy: DecisionPolicy = new RuleDecisionPolicy(),
    private readonly decisionPeriodTicks = 6,
  ) {
    if (!Number.isInteger(decisionPeriodTicks) || decisionPeriodTicks < 1) {
      throw new Error('Brain decision period must be a positive integer');
    }
  }

  update(view: AgentPerceptionView): BrainSnapshot {
    if (!Number.isInteger(view.tick) || view.tick < 0 || view.tick < this.lastViewTick) {
      throw new Error('Brain requires a nondecreasing perception tick');
    }
    if (view.tick !== this.lastViewTick) {
      this.selfModel = updateSelfModel(this.selfModel, view);
      this.worldModel = updateWorldModel(this.worldModel, view);
      this.drives = deriveDrives(this.selfModel, this.worldModel);
      this.lastViewTick = view.tick;
    }
    if (!this.decision || view.tick - this.decidedAtTick >= this.decisionPeriodTicks) {
      this.decision = this.policy.evaluate({ selfModel: this.selfModel, worldModel: this.worldModel,
        drives: this.drives, affordances: createAffordances(this.selfModel, this.worldModel) });
      this.decidedAtTick = view.tick;
    }
    const affordance = this.decision.affordance;
    return { selfModel: this.selfModel, worldModel: this.worldModel, drives: this.drives,
      decision: this.decision, skillIntent: { skill: affordance.skill,
        ...(affordance.parameters ? { turn: affordance.parameters.turn } : {}) } };
  }
}

/** Existing Phase 2 primitive receives only a bounded movement request. */
export function skillIntentToControlIntent(intent: SkillIntent): ControlIntent {
  switch (intent.skill) {
    case 'stand': return { forward: 0, turn: 0 };
    case 'forward': return { forward: 1, turn: 0 };
    case 'turn': return { forward: 0, turn: Math.max(-1, Math.min(1, intent.turn ?? 1)) };
  }
}
