# Phase 6.5 report — Generality & World Foundation

Date: 2026-09-24 (Asia/Shanghai)

Base: accepted `main` at `f91da94`. Phase branch: `codex/phase-6-5-world-foundation`.

## Result

`WorldRuntime` now owns Entity IDs, spawn/remove, inspection, fixed-step execution, physics instance access, and optional actuator, sensor, and Agent composition. Neither WorldRuntime nor its lifecycle API depends on Brain, Skill, or quadruped control. The default browser world contains two passive objects, an actuated machine without Agent, a sensor platform without Brain, and the existing autonomous quadruped. One passive object is the platform's sensor target; a user-triggered impact object also enters through WorldRuntime.

A broken Connection changes the Core connectivity graph and removes the Rapier joint. WorldRuntime derives connected structural components from that state. A separated component gets a stable world ID, keeps its source Entity and original Part physics bodies, and records the Connection and tick that caused separation. It can be inspected, have its Part poses read, and be removed independently; removing it cleans up the associated Rapier bodies and runtime references while the source Entity continues stepping. This preserves the physical history without manufacturing a replacement Entity.

Affected modules: Core structural ownership projection; simulation WorldRuntime and damage retirement; PhysicsAdapter removal; three non-Agent Blueprints; default scene and debug panel; focused tests. The architecture document now states the WorldRuntime, future Construction Runtime, and PhysicsAdapter responsibilities.

## Acceptance evidence on Mac

| Check | Result |
| --- | --- |
| `npm test` | 27 files, 90 tests passed; architecture boundary check passed for 39 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0; existing large Rapier chunk warning |
| `git diff --check` | Passed |
| World lifecycle | Focused test spawned multiple stable Entity IDs, stepped them, removed one, and verified the survivor remained physical; removed IDs cannot be reused |
| Non-Agent machine | In the same WorldRuntime as three other Entity kinds, a ControlSignal drove a joint actuator and changed the real Rapier revolute coordinate without Brain |
| Sensor-only platform | Its range sensor produced observations of a separate WorldRuntime-owned passive Entity without Brain, including after both objects settled on the ground; removing the target removed the range observation |
| Structural separation | A real opposing impulse pair separated `connection-0-a`; WorldRuntime exposed a detached three-Part component with source Entity, Connection, and tick; removing it left the original body stepping |
| Existing Agent | Browser scene continued the Phase 6 Brain/Skill loop, including after structural separation; no Agent API was required for other Entities |
| Browser smoke | Five Entities were visible together; the sensor target appeared in the world registry and the platform reported 5 range observations. External impact added a sixth registered Entity. Impact/Damage displayed a detached fragment and its provenance; the browser error log was empty |
| Generality scan | No `isAnimal`, `isRobot`, `isWheel`, `isLeg`, `canMove`, `canWalk`, `movementSpeed`, `entityType`, or `requiresBrain` field was added to `src/` |

## Scope, boundaries, and limits

WorldRuntime owns **who exists** and the current membership of connected structural components. Construction Runtime will own **intentional edits to structure** in Phase 8A. PhysicsAdapter owns **how the current structure executes** in Rapier. The UI only renders and sends controls; it is not the source of structural truth. After PR review, the default scene's sensor target and temporary impact object were moved into Entity lifecycle. Only the ground remains a direct physics/environment primitive pending Phase 7. Core remains independent of Three.js and Rapier.

This phase does not implement arbitrary Part edits, reattachment, Blueprint save/load, or promotion of a fragment into a separate Entity. A detached component remains linked to its source Entity and original PhysicsBody. The machine uses a simple external periodic signal and idealized energy source; it proves the general actuation path, not a complete machine controller. No Windows validation was run because this Phase's acceptance runs on the Mac browser and Rapier stack. No architecture deviation is known.

Implementation commit: `2aa9e68`. Pull request: [#10 — Phase 6.5: Generality & World Foundation](https://github.com/TTTT-T/Morphodyne/pull/10), targeting `main`. Stop at review; Phase 7 has not begun.
