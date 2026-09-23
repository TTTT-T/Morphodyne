# Phase 5 report — Minimal Agent Brain

Date: 2026-09-23 (Asia/Shanghai)

Base: `main` at `df7b321`

Phase branch: `codex/phase-5-minimal-agent-brain`

## Result

The active body now runs a 10 Hz high-level loop from `AgentPerceptionView` to Self Model / World Model, four bounded Drives, Goal, replaceable `DecisionPolicy`, perception-based Affordance, and a Stand / Forward / Turn Skill Intent. The existing Phase 2 controller and joint actuator runtime convert that attempt into physical output at 60 Hz; Rapier decides the result. `RuleDecisionPolicy` is deterministic and local. No model service or learning code was added.

The Brain's only changing input is a copied `AgentPerceptionView`. Brain modules import no PhysicsAdapter, PhysicsBody, DamageState, Blueprint, Entity list, or world state. Its World Model stores anonymous sensor-local directions and distances with expiry, not target IDs or global positions. Self Model stores observed proprioception, joints, contacts, stability estimate, and a short-lived gap when previously observed feedback disappears. A gap indicates missing evidence; it does not assert structural damage or a lost ability. `SensorRuntime` remains the owner of physical reads.

The view type moved into framework-independent Core so Brain models can depend on it without importing Simulation. The demo starts in Auto mode; manual Stand / Forward / Turn and impact controls remain available. The debug panel shows Goal, Skill, Drives, anonymous surface count, observed joint count, and feedback-gap status.

## Acceptance evidence on Mac

| Check | Result |
| --- | --- |
| `npm test` | 21 files, 68 tests passed; architecture import boundaries passed for 31 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0 |
| `git diff --check` | Passed |
| Perception-only decision | Near anonymous range return selected Avoid / Turn; target physically moved beyond range and the next decision selected Explore / Forward; the same obstacle with no range sensor was unknown to Brain |
| Physics authority | The same Avoid Goal / Turn Skill generated measured joint motion with power and a different measured result with zero power |
| Body damage | Physical impact separated a connection; Self Model lost observed Part / Joint feedback and the mounted range return. The recent feedback gap caused the next decision to select Maintain / Stand without reading damage state |
| Browser smoke | Local Vite/WebGL scene rendered live Brain, sensor, structure, and pose status. An observed intact state had Sensors 3/3 and Explore / Forward; a later separated state had Sensors 1/3 and 10 observed joints. |

## Scope and limits

This is a short-horizon rule loop, not learning or adaptation. Missing range returns cannot distinguish a clear direction from a silent or lost range sensor; the Brain retains only evidence that the view actually carries. Loss of previously observed proprioceptive feedback temporarily favors stability, but Phase 6 must address lasting control degradation. Stand / Forward / Turn are attempts and do not promise movement. No Windows validation was run; Mac is the active development environment. The existing large Rapier-containing build-chunk warning remains nonblocking.

No Architecture principle changed. The Roadmap's richer Memory, Prediction, and Planner work is deferred in favor of the requested minimal Phase 5 causal loop. Implementation affects `src/core/sensing.ts`, the new Core brain modules, `src/simulation/BrainRuntime.ts`, `src/simulation/SensorRuntime.ts`, `src/main.ts`, and focused tests in Core, Simulation, and Tools.

Implementation commit: `d87efc8`. Pull request: [#8 — Phase 5: Minimal Agent Brain](https://github.com/TTTT-T/Morphodyne/pull/8), targeting `main`.
