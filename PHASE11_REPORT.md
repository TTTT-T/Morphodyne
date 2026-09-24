# Phase 11 Report — Finite Energy and Shared Power

Date: 2026-09-24. Branch: `codex/phase-11-energy-power`. Base: latest `main` at `27c72af`.

## Result

Actuated Entities now have an explicit finite Energy store. `WorldRuntime` owns its state and preserves it through structure reconstruction. `ActuatorRuntime` gathers positive mechanical power demand from every Joint and Tension Actuator in the Entity, obtains one proportional allocation from `EnergyRuntime`, then applies the scaled torque or force through `PhysicsAdapter`. Rapier remains responsible for motion and the existing Structural Load → Damage path. Energy never directly sets movement, capability, or damage.

The main changes are `src/core/actuation.ts` (finite supply declaration and validation), `src/simulation/EnergyRuntime.ts` (budget and accounting), `src/simulation/ActuatorRuntime.ts` (signed mechanical work and shared allocation), and `src/simulation/WorldRuntime.ts` (ownership and inspection). The demo, Sandbox catalog, and existing test fixtures use explicit finite supplies. `docs/ARCHITECTURE_v0.2.md` records the model and extension boundary.

## Units and rules

| Quantity | Unit | Rule |
| --- | --- | --- |
| Capacity, remaining, consumed, step draw | J | `0 ≤ remaining ≤ capacity`; consumed never decreases |
| Maximum/step mechanical power | W | `1 W = 1 J/s`; shared across actuator kinds |
| Efficiency `η` | ratio | `0 < η ≤ 1` |
| Joint positive power | W | `max(0, output × signed joint velocity)` |
| Tension positive power | W | `tension × max(0, contraction speed)` |
| Step power ceiling | W | `min(maxPowerWatts, remainingEnergyJ × η / Δt)` |
| Step stored-energy draw | J | `allocatedPositiveMechanicalPowerWatts × Δt / η` |

The allocator scales all demanded outputs by the same factor. Mechanical demand is sampled before the fixed physics step. Static force at zero sampled velocity has zero modeled work, including a startup step that begins at rest. Negative mechanical work does not recharge the store. The model omits static holding losses, heat, regenerative braking, and detailed fuel or muscle mechanisms. This pre-step approximation can undercount work during initial acceleration within one fixed step; it should not be read as exact continuous-time energy conservation.

## Phase experiments

The new integration test uses a non-Agent machine containing a prismatic Joint Actuator and a separate Tension Actuator. All outputs pass through `WorldRuntime → EnergyRuntime → ActuatorRuntime → Rapier`. Measurements below come from the Mac Rapier test run at the fixed 1/60 s step.

| Experiment | Input and measured result | Acceptance |
| --- | --- | --- |
| A. Finite exhaustion | 0.2 J store reached 0 J on tick 2. After 12 ticks, step mechanical power remained 0 W and the tension pair's relative speed stayed at 1.267 m/s in magnitude after depletion. | No further active acceleration after energy is exhausted. |
| B. Power limit | With equal 100 J stores after 15 ticks, 1 W versus 100 W yielded tension spans of 1.770 m versus 0.787 m. Observed step power was 1 W versus 100 W. | The watts ceiling changes physical output and motion. |
| C. Shared budget | At 10 W, Joint alone reached 0.136 m of travel, Tension alone reached 1.864 m span, and both together reached 0.104 m and 1.896 m span. Both together used 10 W total, not 20 W; reversing declaration order gave the same physical result. | Mixed actuator kinds share one supply proportionally. |
| D. Efficiency | With equal 1 J stores and identical initial response, the second step drew 0.222 J at `η=1` and 0.444 J at `η=0.5`. The less efficient store emptied on tick 3 versus tick 4; after 15 ticks its tension span was 1.598 m versus 1.481 m. | Efficiency changes draw and endurance without changing initial output. |
| E. No recharge | An external impulse drove the prismatic joint opposite its commanded force. Its signed velocity was −2.333 m/s; the next step used 0 W, drew 0 J, and retained the full 10 J store. | Negative work cannot increase stored energy. |

The same test also verifies that Construction-style structure replacement preserves the store and that subsequent actuation keeps consuming it. Core validation checks finite units/ranges; `EnergyRuntime` unit tests check joule and watt ceilings, efficiency, depletion, and invalid input.

## Validation and boundaries

- Mac: `npm test` — 34 files, 137 tests passed (includes Phase 9/10, Joint, Construction, and WorldRuntime regressions).
- Mac: `npm run typecheck` — passed.
- Mac: `npm run build` — passed.
- Mac: `npm run check:boundaries` — passed.
- Windows / browser: not run for this Phase; the changed runtime was validated through the real Rapier backend on Mac.
- No architecture deviation or unresolved implementation blocker. The pre-step mechanical-work approximation above is the main known accuracy limit.

Review handoff: implementation commit `f3c520d`; [PR #16](https://github.com/TTTT-T/Morphodyne/pull/16) targets `main`. Phase 12 has not been started.
