# Phase 9 Report — Universal Structural Load

## Result and scope

Phase 9 extends the existing structural Damage path from impact impulse alone to measured connection force and torque. The fixed-step path is `WorldRuntime → RapierPhysicsAdapter → StructuralDamageRuntime → Core applyConnectionLoad → physical joint removal / component reconciliation`. Passive structures and non-Agent actuated machines use the same path. No Brain, Skill, locomotion, or Phase 10 behavior was added.

Changed modules: `src/core/model.ts` (thresholds and validation), `src/core/damage.ts` (shared response state), `src/physics/PhysicsAdapter.ts` and `src/physics/RapierPhysicsAdapter.ts` (load observation), `src/simulation/StructuralDamageRuntime.ts` and `src/simulation/WorldRuntime.ts` (fixed-step routing), focused Core and integration tests, and `docs/ARCHITECTURE_v0.2.md`.

## Load definition and source

| Channel | Unit | Source and response |
| --- | --- | --- |
| Impact | N·s | Existing per-Part applied impulse/contact-force path, distributed to live connections; original impulse thresholds and regression behavior retained. |
| Force | N | Per-connection estimate from observed rigid-body linear momentum change over the last Rapier step, minus gravity and explicitly applied forces. |
| Torque | N·m | Per-connection estimate from observed angular momentum change, minus explicitly applied torque; contacted actuator joints use the measured blocked-side response. |
| Sustained overload | normalized s | `Σ seconds × max(0, force/yieldForce − 1, torque/yieldTorque − 1)`. Sub-yield samples add zero; 1 s at 2× yield reaches separation. |

Connection thresholds override endpoint material thresholds. With no explicit sustained threshold, the capacity is unbounded, so existing v0.1 Blueprints retain their established impact response. `ultimateForceN` or `ultimateTorqueNm` causes immediate fracture; sustained over-yield deforms first and then separates through the existing connection/Part Damage state. Force and torque are separate current magnitudes; they are not converted into a new per-tick impact impulse.

Rapier 0.20.0's public `ImpulseJoint` API has no reaction-force, reaction-torque, or solver-impulse getter. The adapter therefore uses a first-order momentum-balance estimate based on actual post-step physical state. It prefers the endpoint with fewer contact points and, when tied, the lighter endpoint. The estimator is strongest for one load path; attribution in multi-connection assemblies and simultaneous contacts is approximate. It does not calculate internal stress distributions, bending inside a Part, fatigue below yield, or exact solver reactions. These are known limits, not fixture-specific Damage paths.

## Physical experiments

The four reproducible experiments live in `src/tools/phase9StructuralLoad.test.ts` and run through `WorldRuntime.stepOnce()` with Rapier. All quantities below are from the Mac test run at a 1/60 s fixed step. Connection thresholds are fixture properties; no code branches on mass, Entity type, obstruction, or test ID.

| Experiment | Control and measured physical result | Structural result |
| --- | --- | --- |
| A — Weight Creates Load | Identical passive support; hanging mass 1 kg vs 5 kg. Peak connection force 9.93 N vs 57.79 N. | With 25 N yield / 100 N ultimate, light stays intact after 75 ticks; heavy accumulates overload and separates. |
| B — Free Joint vs Stalled Joint | Same 20 N·m actuator and machine; a static box blocks one arm. Over 25 ticks, free vs blocked peak force 43.71 vs 130.38 N, peak torque 17.42 vs 45.46 N·m, maximum joint rotation 1.405 vs 0.203 rad. | At the same 25 N·m yield / 40 N·m ultimate, free stays connected; blocked separates from measured torque. |
| C — Sustained Pull | Identical rigid two-Part connection; opposite physical forces 4 vs 18 N. Measured peak connection force 4.00 vs 18.00 N. | With 8 N yield / 40 N ultimate, 4 N stays intact; 18 N accumulates overload and separates at tick 47 without contact. WorldRuntime exposes two components afterward. |
| Torque cross-check | Force couple of 2 vs 20 N on an isolated two-Part rigid structure yields measured peak connection torque 0.037 vs 0.370 N·m. | At 0.1 N·m yield / 0.3 N·m ultimate, the higher physical load separates the connection without an impact event. |

## Validation and review

- `npm test`: 31 files, 118 tests passed; includes impact regression, Core overload response, and the real WorldRuntime experiments.
- `npm run typecheck`: passed.
- `npm run build`: passed on Mac. Vite reports the existing large bundle warning; no build failure.
- `npm run check:boundaries`: passed; Core remains independent of Rapier and Three.js.
- Diff reviewed for semantic ability flags, fixture logic in Core/Physics, unrelated files, and generated output. None were introduced.
- Windows validation was not run; Phase 9 acceptance is established on the primary Mac runtime. No UI-specific behavior changed.

Review branch: `codex/phase-9-structural-load`, targeting `main`. The pull request and final commit identifiers are recorded in GitHub and the final handoff.
