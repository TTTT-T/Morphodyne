# Phase 8 report — Construction, God Sandbox & Core Validation

Date: 2026-09-24 (Asia/Shanghai). Base: accepted `main` at `79cd432`. Branch: `codex/phase-8-construction-sandbox`.

## Result

ConstructionRuntime now validates and edits Blueprint-backed world structure. It can spawn, add/remove/modify Parts, create/remove Connections, intentionally detach and reattach a Connection, add/remove Actuators and Sensors, inspect ownership and damage, and serialize/parse Blueprints. WorldRuntime keeps Entity identity and component ownership, then asks PhysicsAdapter to reconstruct edited bodies. Rapier preserves the world pose and linear/angular velocity of surviving Parts; separated connections stay physically absent until an explicit repair or reattachment. Unrelated structural damage survives reconstruction. Invalid Blueprints are rejected before the live body is changed.

The God Sandbox adds a small UI over those APIs for structure inspection and edits, impact/repair, pause/step/time scale, and Blueprint JSON validation and loading. It renders current World Parts after reconstruction. The default browser scene remains a world with passive objects, a non-Agent machine, a sensor platform, an Agent, Surfaces, and Water.

Affected modules: `src/simulation/ConstructionRuntime.ts`, `WorldRuntime.ts`, `StructuralDamageRuntime.ts`; `src/physics/PhysicsAdapter.ts`, `RapierPhysicsAdapter.ts`; `src/tools/GodSandboxPanel.ts`; `src/main.ts`, `src/rendering/ThreeSmokeRenderer.ts`; focused tests and Architecture section 3.3. There is no deviation from the Architecture's World/Construction/Physics ownership or generality rules.

## Five core experiments

The executable experiments are in `src/tools/phase8CoreValidation.test.ts` and passed on Mac. Each assertion checks an observable cause and result:

| Experiment | Evidence |
| --- | --- |
| Structure creates capability | A passive object has no Actuator/Agent; a powered non-Agent hinged machine produces nonzero joint displacement. Two machines with identical geometry and control but different arm mass produce joint positions differing by more than 0.001 rad after 12 ticks. The Agent fixture has optional sensors and actuation. No capability or speed stat is assigned. |
| Damage creates functional loss | A localized opposing impulse pair separates the active body's limb Connection. Over 90 physics steps, its maximum limb-to-core gap exceeds 2 m and is over 0.8 m greater than the intact trial; the intact Connection remains connected. No gait/debuff is applied. |
| Environment changes capability | The same Water buoyancy and directional Field paths raise and displace the measured Part of a passive object, powered non-Agent machine, and Agent compared with dry worlds. Region inspection identifies the Water/Field for each. Phase 7 Surface/slope/rain tests remain in the full suite. |
| Agent acts on belief | A sensed target initially produces range evidence and a turn intent. After the target physically leaves range, the World Model has no current range evidence and the Brain selects exploration/forward. A trial without a range sensor never receives target evidence and also selects forward. The Brain receives SensorRuntime's Agent view, not target truth. |
| Adaptation | The existing controller/Skill loop runs before and after a physical limb separation. At unchanged control amplitude, measured forward progress drops by over 0.05 m relative to the stable pre-damage sample and absolute prediction error more than doubles. Subsequent experience increases amplitude and adaptation count; the generic policy adjusts from measured prediction error. No damaged-gait branch was added. |

## Acceptance checks

| Check | Result |
| --- | --- |
| `npm test` | 30 files, 109 tests passed; architecture boundary check passed for 42 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0; existing large Rapier bundle warning |
| `git diff --check` | Passed |
| Reconstruction/Construction tests | Surviving Part pose and velocities retained; new Part placed from Blueprint and origin; inactive connections omitted; invalid edit leaves prior body intact; detach/reattach restores one component; damage stays separated through an unrelated Sensor edit; explicit repair rebuilds the joint. Passive, machine, sensor platform, and Agent Blueprints were exercised. |
| Mac browser smoke | Five default Entities rendered with no browser error logs. Paused world advanced exactly one tick on Step. UI spawn raised count to six; Add Part produced a detached component; Add rigid connected it; Detach split it; Reattach merged it. Quick mass edit changed the inspected value from 3 to 6. Loading Blueprint JSON spawned a new Entity. Invalid JSON displayed the missing-array validation error and retained the user's draft. |
| Generality scan | No semantic `isAnimal`, `isLeg`, `isWheel`, `canWalk`, or `moveSpeed` field or branch was added. Construction and Environment do not depend on Brain or Skill. |

## Limits and handoff

Intentional reattachment in v0.1 reconnects components belonging to the same source Entity. Combining independent source Entities into one assembly is outside this runtime API. The UI's Blueprint save/load path is a JSON editor for copying or pasting serialized Blueprints; it does not persist a whole World snapshot or transient damage/velocity. Reconstructing a modified Part retains its current pose and velocity, while a new Part starts at its Blueprint-local pose plus the Entity's spawn origin. The catalog's powered machine has a control source; an uncontrolled Actuator declaration alone does not produce motion. The existing Water and lighting approximations remain as documented in `PHASE7_REPORT.md`.

Mac browser and Rapier validation completed. Windows validation was not run; the Roadmap treats it as optional for this Phase. No post-v0.1 animal/ecology work began.

Implementation commit: `6005367` (`Phase 8: construction runtime, sandbox controls, and core validation`). Pull request: pending creation, targeting `main`.
