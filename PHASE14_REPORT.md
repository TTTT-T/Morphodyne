# v0.3 Phase 14 — Universal Contact Material Damage

## Scope and architecture

Phase 14 adds a material response to measured external contact on a Part, including a connectionless passive Part. It does not add an attacker/target concept or a second damage state. [Architecture v0.3](docs/ARCHITECTURE_v0.3.md) records the load-flow decision.

v0.2 routed `readPartImpactImpulse` into incident Connections. That value merged Rapier contact-force events with directly applied test impulses; `applyConnectionLoad` then damaged both Connections and endpoint Parts. A single Part had no incident Connection and could not reach its own material damage path. Passing the same merged value to a Part handler would duplicate a contact.

Rapier now reports separate per-step contact force/impulse and directly applied impulse channels. `StructuralDamageRuntime` sends contact to Core `applyPartLoad`, estimated internal reaction to `applyConnectionLoad` with endpoint damage disabled, and free applied impulses to the earlier connection distribution path. Part fracture separates every incident Connection; WorldRuntime then derives component ownership. No direct transform, Damage, or capability result is set by UI or an actuator.

Affected modules: `src/core/damage.ts` owns material state transitions; `src/physics/PhysicsAdapter.ts` and `RapierPhysicsAdapter.ts` expose measured load channels; `src/simulation/StructuralDamageRuntime.ts` routes them and `WorldRuntime.ts` provides read-only inspection; `src/tools/GodSandboxPanel.ts` displays selected-Part damage and recent contact load. `docs/ARCHITECTURE_v0.3.md` records the rule; Core remains free of Rapier and Three.js imports.

## Material law and units

| Signal | Unit | First-order response |
| --- | --- | --- |
| `contact.forceN` | N | Rapier contact-force event magnitude; compared with `yieldForceN` / `ultimateForceN` |
| `contact.impulseNs` | N·s | `forceN × fixed step seconds` from the same event; rising part `max(0, Iₜ − Iₜ₋₁)` enters the impulse response |
| overload integral | normalized s | Adds `Δt × max(0, F / yieldForceN − 1)`; fracture at 1, or immediately at ultimate force |
| impulse overload | N·s | Existing excess over `yieldImpulseNs`, residual capacity, and `toughnessImpulseNs` govern deformation/fracture |

Impulse and sustained force are alternative aspects of the same measured contact. A stable contact does not add its `F × Δt` as a fresh impact on every tick. The internal Connection reaction changes Connection state without also accumulating endpoint Part damage. Materials omitting all four relevant thresholds retain old no-direct-contact-damage behavior.

## Real Rapier + WorldRuntime experiments

Quantitative observations and acceptance conditions are in `src/tools/phase14ContactDamage.test.ts`. All use real Rapier and WorldRuntime fixed steps on Mac.

| Experiment | Controlled change | Observed physical load and outcome |
| --- | --- | --- |
| A — single Part impact | Projectile impulse 3 vs 18 N·s; same connectionless passive target | Target peak contact impulse 1.537 vs 9.017 N·s; low intact, high fractured; contact observed in both |
| B — material comparison | Same geometry, mass, projectile impulse 18 N·s; target impulse yield/toughness 2/5 vs 20/50 N·s | Both received identical 9.017 N·s peak contact; weak fractured, strong intact |
| C — sustained compression | Non-Agent prismatic press output 10 vs 60 N, same target/support and 150 steps | Target contact persisted for 150 steps in both; peak force 190.55 vs 991.76 N, force integral 74.13 vs 474.91 N·s; low degraded 0.0298, high fractured at normalized overload 1. High peak per-step contact impulse was 16.53 N·s, far below its 1000 N·s impulse yield; both had zero accumulated impact damage |
| D — different causes | Identical target Blueprint/Material/geometry/mass; launched passive object vs non-Agent press | Peak target force 164.13 vs 190.55 N; both degraded through the same Part path, deformation 0.0245 vs 0.0325. Different contact histories explain the modest difference |
| E — structural loss | Same initial structure and drive signal after a 30-step prelude; only the impacted trial receives a projectile contact | Critical Part measured 20.524 N·s peak contact / 1231.43 N and fractured at prelude tick 12; both incident Connections separated with zero accumulated connection impulse, component count 1 → 3, active actuator list became empty. Matched 60-step relative displacement was 5.121 m intact vs 0.301 m after fracture |

The Part's `fractured` state means material/structural failure and incident joint separation. Its Rapier rigid body and current mesh remain in the world; this Phase does not generate fragments or modify geometry. The measured function comparison in E is an observation, never an input to Core. In E, the incident Connections have zero accumulated impulse damage: their separation follows Part fracture rather than a duplicate distribution of the same contact.

## Regression and anti-cheat

The compatibility experiment runs the existing active-body and Phase 13 catalog Blueprints for 180 fixed steps on ordinary ground and observes zero Part fractures. Phase 8's localized-damage physical-gap margin is now 0.7 m versus its earlier 0.8 m assertion: the intact control reached 1.270 m, while the separated structure reached 2.046 m (difference 0.776 m). The run still requires connection separation, over 2 m absolute gap, and a larger gap than the intact control. This is a calibrated assertion for the changed routing.

The production code scan over `src/core`, `src/physics`, `src/simulation`, and `src/tools` excluding tests found no `weapon`, `attacker`, `victim`, `biteDamage`, `clawDamage`, `attackPower`, `armorRating`, `isTarget`, `isBreakable`, fixture/experiment-ID damage branch, or mass-based fracture branch. Core has no Rapier import. Physics does not decide material state. Agent does not participate.

## Validation

Mac validation on the Phase branch:

- `npm test`: 41 files, 162 tests passed, including five real Phase 14 experiments, Core direct-Part tests, the ordinary-contact compatibility test, and Phase 9–13 regression tests.
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite reports the pre-existing large bundle size warning; it does not fail the build.
- `npm run check:boundaries`: passed across 45 TypeScript files.
- `git diff --check`: passed.
- Production anti-cheat scan: no forbidden terms or fixture/experiment-ID damage branches found.

Windows and browser UI acceptance were not run; Phase 14's required physics experiments and regressions ran on Mac. The God Sandbox change is limited to selected-Part damage/contact inspection and passed typecheck/build.

## Known limits

Rapier contact-force events provide magnitudes, not local stress, pressure, contact area, or exact energy deposition. The rising-edge impulse approximation can undercount repeated impacts without a complete contact release. The sustained overload integral is not fatigue or crack propagation. Connection reaction remains v0.2's momentum-balance estimate, not a solver-exact joint force. `fractured` does not shatter a visual mesh. No Windows run was performed; Mac is the primary development and validation environment for this Phase.

Architecture deviations: none. The remaining modeling risks are the low-fidelity contact transient and multi-joint reaction estimates described above.

## Review handoff

- Implementation commit: `fad2663` (`feat: add universal external Part contact damage`).
- Phase branch: `codex/phase-14-contact-material-damage` targeting `main`.
- Pull request: [#19 — Phase 14: universal external contact material damage](https://github.com/TTTT-T/Morphodyne/pull/19).
- This report update records the review link; Phase 15 has not started.
