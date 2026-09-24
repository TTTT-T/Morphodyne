# NEXT TASK — Phase 8: Construction, God Sandbox & Core Validation

Read first:

1. `AGENTS.md`
2. `docs/ARCHITECTURE_v0.1.md`
3. `docs/ROADMAP_v0.1.md`
4. `PHASE7_REPORT.md`

Then execute **Phase 8** as one integrated delivery.

## Operating rule

Do not stop for user relay between internal milestones.

Use one Phase 8 branch, one implementation stream, one `PHASE8_REPORT.md`, and one PR to `main`.

Only stop and ask the user if blocked by permissions, unavailable external resources, or an architectural decision that cannot be resolved from the repository.

The main agent owns architecture/integration. Delegate bounded work to `gpt6-luna` where useful. Do not create verifier/reviewer subagents.

## Milestone A — Construction Runtime

Implement the generic runtime structural editing boundary:

- create/spawn Blueprint-backed Entity;
- add/remove Part where runtime-safe;
- modify geometry/material/mass through an explicit reconstruction path;
- create/remove Connection;
- attach/detach/reattach structures;
- add/remove Actuator;
- add/remove Sensor;
- inspect structure;
- save/load Blueprint;
- Blueprint validation;
- explicit ownership of detached components and reconstructed assemblies.

WorldRuntime owns who exists.
Construction Runtime owns intentional structural edits.
PhysicsAdapter executes the resulting structure.
UI must not become structural truth.

No semantic ability/type fields such as `isAnimal`, `isLeg`, `isWheel`, `canWalk`, `moveSpeed`, or equivalent shortcuts.

## Milestone B — God Sandbox UI

Build the first usable shell on top of Construction Runtime:

- spawn Blueprint;
- select/inspect Entity, Part, Connection;
- modify through Construction Runtime;
- attach/detach/reattach;
- damage / God Repair where currently supported;
- pause;
- step tick;
- slow motion;
- save/load Blueprint;
- show validation errors.

Keep the UI simple. Observability and correctness matter more than polish.

The default scene should remain a **world**, not a quadruped demo.

## Milestone C — Core Validation

Before opening the PR, run and document these five experiments:

1. **Structure Creates Capability**
   - compare structurally different Entities;
   - include non-Agent and Agent-bearing structures;
   - no capability/speed stats.

2. **Damage Creates Functional Loss**
   - localized structural damage changes real physical function;
   - no canned injury/debuff.

3. **Environment Changes Capability**
   - passive, actuated non-Agent, and Agent-bearing structures respond through shared Surface/Water/Field rules.

4. **Agent Acts on Belief**
   - remove/hide current sensory evidence;
   - Agent behavior must depend on Sensor/World Model, not authoritative target truth.

5. **Adaptation**
   - structural damage degrades an existing Skill;
   - prediction error causes control parameters to change;
   - no pre-authored damaged gait.

Use the smallest experiments that prove the causal chain. Do not expand Brain, RL, Jev/LLM, ecology, soft-body/FEM, or advanced weather.

## Acceptance

Phase 8 is complete only when:

- Construction Runtime generically edits passive, non-Agent actuated, sensor-bearing, and Agent-bearing structures;
- detached structure can be intentionally detached/re-attached or reconstructed through explicit construction operations;
- God Sandbox UI only calls World/Construction APIs;
- all five core validation experiments have concise evidence;
- the generality gate remains intact;
- tests/typecheck/build/browser smoke pass.

Then:

- write `PHASE8_REPORT.md`;
- commit and push the Phase 8 branch;
- open one PR to `main`;
- stop at the final v0.1 review boundary.

Do not begin post-v0.1 animal/ecology work.
