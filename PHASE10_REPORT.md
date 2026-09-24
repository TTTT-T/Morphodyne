# Phase 10 Report — Universal Tension Actuator

## Result and scope

Phase 10 adds an Actuator that pulls between two Part-local attachment points through equal and opposite Rapier point forces. Joint and Tension Actuators share one `ControlSignal → ActuatorRuntime → PhysicsAdapter` path. The output changes motion through geometry and mass, and any resulting connection load enters the existing Phase 9 Structural Damage path. Passive Entities and non-Agent machines remain valid; no Brain, Skill, energy-storage, or Phase 11 system was added.

Changed modules: `src/core/actuation.ts`, `src/core/model.ts`, and `src/core/structureOwnership.ts` define and validate the generic actuator and ownership model; `src/physics/PhysicsAdapter.ts` and `src/physics/RapierPhysicsAdapter.ts` expose and execute point force, point position, and point velocity; `src/simulation/ActuatorRuntime.ts` shares response time and power accounting between actuator kinds; WorldRuntime and ConstructionRuntime handle lifecycle and edits; God Sandbox retains its existing joint editor while accepting tension declarations via Blueprint JSON. Focused Core, adapter, Construction, and WorldRuntime tests accompany the changes. Architectural semantics are recorded in `docs/ARCHITECTURE_v0.2.md`.

## Physical contract

| Quantity | Unit and rule |
| --- | --- |
| `fromAttachment`, `toAttachment` | Metres in each Part's local frame; transformed by that Part's current world pose. |
| `maxOutput` | Newtons of active tension. Equal magnitude acts at both world-space attachment points, in opposite directions along their current line of separation. |
| `ControlSignal.value` | `[0, 1]` requests zero to maximum tension; negative values request zero and never push. Existing Joint Actuator signals remain signed. |
| `responseTimeSeconds` | Existing first-order output ramp, also applied during tension release. |
| Near-zero separation | Below `10⁻⁶ m`, no direction is defined and neither point force is applied for that step. Force never exceeds `maxOutput`. |
| Positive mechanical power | `tension × max(0, -d(length)/dt)` watts from Rapier attachment-point velocities. Both actuator kinds share the existing available-power ceiling and proportional scaling. Zero available power suppresses output. |

Tension is active contraction, without passive elasticity or slack hysteresis. It can pull Parts in separate structural components of the same Entity; the `fromPartId` component owns the control channel, while the actuator itself does not merge their structural ownership. Removing either Part prunes the declaration. Removing a Connection affects only dependent Joint Actuators. Existing saved Joint Actuator Blueprints retain their omitted `kind` field and behavior.

## Physical experiments

The reproducible experiments run through `WorldRuntime.stepOnce()` in `src/tools/phase10TensionActuator.test.ts` at 1/60 s per tick. The hinged machine has a 100 kg support Part and 2 kg arm, with a 40 N Tension Actuator and a physical support surface. All paired cases use identical Parts, Connection, control signal, power ceiling, and maximum tension; only the stated geometry or obstruction changes. The hinge is a Rapier joint, never a commanded actuator target.

| Experiment | Quantitative result | Acceptance |
| --- | --- | --- |
| A — Lever Arm Creates Rotation | Over 25 ticks, moving only the arm attachment from −0.3 m to +0.3 m relative to the arm centre changes final hinge angle from −0.461 to +0.838 rad. Relative to the no-pull baseline (−1.173 rad), pull responses are +0.712 vs +2.011 rad. | Longer effective moment arm yields over 2.5× the rotational response with the same declared 40 N output. |
| B — Geometry Changes Capability | Moving only the base attachment from the hinge-height line to 0.5 m above it changes final angle from −1.180 to +0.838 rad. The hinge-height case differs from no-pull by only −0.007 rad; the offset case differs by +2.011 rad. | Attachment direction, rather than an ability parameter, determines useful rotation. |
| C — Blocked Pull Produces Structural Load | Free vs physically blocked arm: peak estimated hinge force 37.82 vs 114.82 N; peak estimated hinge torque 4.43 vs 24.76 N·m; maximum angle 0.838 vs 0.203 rad. | At identical 8 N·m yield / 20 N·m ultimate connection thresholds, free stays intact and blocked separates at tick 13 through `Rapier → Structural Load → Damage`. |
| D — Tension Does Not Push | Zero and −1 signals, and zero available power, all match the no-active-tension trajectory (−1.173 rad final angle); +1 reaches +0.838 rad. Initially coincident attachments produce the same first step as zero tension, with finite values. | Negative input never reverses force; undefined pull direction does not create an impulse or nonfinite state. |

A separate two-Part WorldRuntime case has no Connection. The 20 N actuator still shortens the gap between the components, and their equal masses preserve the horizontal centre of mass. This verifies equal/opposite force and that a Connection is not an implicit actuator requirement. The focused adapter test separately shows that applying force off a rigid body's centre causes rotation, while a centred force does not. A response-time comparison confirms that the same first-order ramp applies to tension.

## Validation and limits

- `npm test`: 32 files, 127 tests passed on Mac, including Phase 9 Structural Load, existing Joint Actuators, and the WorldRuntime experiments above.
- `npm run typecheck`: passed.
- `npm run build`: passed on Mac. Vite emitted its existing large-bundle advisory; the build succeeded.
- `npm run check:boundaries`: passed for 43 TypeScript files; Core remains independent of Rapier and Three.js.
- Diff and architecture review: checked for semantic ability flags, direct Actuator-to-Damage calls, fixture logic in Core/Physics, unrelated files, and generated output. None were introduced.

Phase 9's connection load is a momentum-balance approximation, not an exact Rapier joint reaction; simultaneous contacts and multi-joint load attribution remain approximate. The tension model omits passive cable elasticity, slack hysteresis, stored energy, regeneration, and fatigue. The God Sandbox form still creates Joint Actuators; Tension Actuators can be loaded or saved as validated Blueprint JSON and manipulated through ConstructionRuntime. Windows-specific validation was not performed; the primary acceptance evidence uses the Mac Rapier runtime.

Review branch: `codex/phase-10-tension-actuator`, targeting `main`. Commit and pull-request metadata will be added at handoff.
