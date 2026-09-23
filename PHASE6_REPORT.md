# Phase 6 report — Skill & Adaptation

Date: 2026-09-24 (Asia/Shanghai)

Base: accepted `main` at `8b9e37e`. Phase branch: `codex/phase-6-skill-adaptation`.

## Result

Forward Skill now makes 0.5-second attempts with adjustable motor amplitude and phase offset. A prediction uses the agent's Self Model, World Model, current parameters, and bounded recent Experience. A proprioceptive sensor estimates body-local velocity from successive physical poses; only that sensor measurement enters the Self Model. Skill runtime integrates those perceived samples, records the observed result and signed prediction error, and adjusts parameters after two sufficiently large errors at the same setting. Experience retains at most 30 attempts and no world position or damage truth.

The control path remains `Skill → ControlIntent → Motor Primitive → ControlSignal → JointActuatorRuntime → Rapier`. Phase 5 `DecisionPolicy` is unchanged. `BrainRuntime`, Skill prediction, and adaptation receive no `DamageState`, Physics World, or authoritative body pose. The browser panel exposes the loop for debugging without feeding values back into the Agent.

## Acceptance evidence on Mac

| Check | Result |
| --- | --- |
| `npm test` | 24 files, 80 tests passed; architecture boundary check passed for 36 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0; existing large Rapier chunk warning |
| `git diff --check` | Passed |
| Prediction, observation, Experience | Focused Core tests verify parameter-sensitive predictions, perception-derived velocity integration, signed error, and bounded records |
| Control effect | Controller test verifies that amplitude and phase change emitted motor signals; absent parameters preserve previous behavior |
| Normal physical attempts | In the deterministic Rapier trial, the last three intact 0.5-second attempts held amplitude 0.76; the last two measured forward progress values were 0.123 m and 0.265 m |
| Real structural damage | An impulse pair separated `connection-0-a`. At the same amplitude 0.76, the first two later observed values were -0.021 m and -0.050 m; mean progress changed from +0.194 m to -0.035 m. Mean absolute progress prediction error rose from 0.052 m to 0.191 m |
| Adapted physical attempts | Repeated error increased amplitude from 0.76 to 0.84, then 0.92. A later 0.92 attempt observed +0.149 m, measurably different from the damaged old-parameter attempts. The experiment does not claim full recovery or isolate parameter effect from all evolving body dynamics |
| Browser smoke | Local Vite/WebGL scene displayed live Goal, Skill, prediction, observation, error, parameters, and adaptation count. An observed separated state showed Sensors 1/3, amplitude 1.00, phase 0.60 rad, and nine adjustments. The only browser console error was a missing favicon |

The physical test asserts the controlled damage, same-parameter degradation, error increase, subsequent parameter change, and changed observed motion. The damage state is read only by the sensor/physics side and by the test assertion, not by the Agent's learning path.

## Scope and limits

The first adaptation policy is a deterministic small-step search driven by repeated negative forward-progress prediction error. It tunes Forward only; Stand and Turn retain their Phase 5 behavior. The initial prediction has a simple motor-response prior and then weights observed Experience heavily. This proves a short causal learning loop for one body and damage experiment, not general locomotion optimization. A single sensor-derived local velocity estimate can be noisy or unavailable, and attempts without enough samples are not learned. No Windows validation was run. No Architecture principle changed.

Affected modules: Core sensing/brain estimates, new Core Skill learning and adaptation, simulation sensor and Skill runtimes, motor primitive, browser debug panel, and focused tests. Implementation commit: `65a6d08`. Pull request: pending creation.
