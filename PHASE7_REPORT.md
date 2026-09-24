# Phase 7 report — World & Environment

Date: 2026-09-24 (Asia/Shanghai)

Base: accepted `main` at `20487e7`. Phase branch: `codex/phase-7-world-environment`.

## Result and causal path

`WorldRuntime` now owns an `EnvironmentRuntime` with Surface, Water Volume, directional Field, weather, and daylight state. Surfaces are Rapier colliders with environment friction; Part materials remain on their Part colliders, so Rapier resolves their contact. Slopes are rotated collider geometry. Rain changes Surface friction through the same collider path. Water estimates submerged Part volume and applies buoyancy and velocity-dependent drag as step-scoped physical forces. Fields apply physical forces to Parts. All live Parts, including those in detached structural components, use the same path. Environment code has no Entity-kind, Brain, or Skill branch; the Agent receives no environment debug truth.

The default browser world displays dry and slippery surfaces, a slope, a translucent water volume, passive objects, an actuated non-Agent machine, a sensor platform, and an autonomous Agent together. Environment state and per-Part region truth are available in an expandable debug panel. Rain/Clear and Day/Night controls change World-owned state. Daylight changes renderer lighting only; the current range sensor has no light dependency.

Affected modules: Core environment model; simulation EnvironmentRuntime and WorldRuntime; PhysicsAdapter/Rapier collider and force operations; browser fixture, renderer, and debug scene; focused physics and cross-Entity tests; Architecture section 12.1. There is no architecture deviation.

## Acceptance evidence on Mac

| Check | Result |
| --- | --- |
| `npm test` | 28 files, 99 tests passed; architecture boundary check passed for 41 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0; existing large Rapier chunk warning |
| `git diff --check` | Passed |
| Surface and rain | Focused Rapier test measured farther sliding with lower collider friction; cross-Entity test compared dry, slippery, and rain contact on the same slope for passive object, actuated machine, and Agent |
| Slope | Passive block moved downhill on a rotated collider under gravity; no slope state or penalty is assigned to the Entity |
| Water and Field | Focused test measured greater vertical and horizontal displacement for passive object, machine, sensor platform, and Agent through the same Part force path; a separate test measured velocity damping from drag |
| Browser smoke | Five Entities visible together. The sensor platform remained active with 5 range observations. Rain changed dry/slippery/slope friction from `0.90/0.08/0.65` to `0.50/0.04/0.32`; Night changed daylight from `1.00` to `0.08`. Region debug showed the sensor platform and target in water; browser error log was empty |
| Generality scan | No `inWaterSpeedPenalty`, `rainPenalty`, `terrainType`, `isAnimal`, `isRobot`, or `hasBrain` condition was introduced in the environment path |

## Limits and handoff

Water uses axis-aligned volume bounds and an unrotated bounding-box overlap estimate for submerged Part volume. It does not model waves, currents, shape-exact displacement, or fluid dynamics. The browser fixture uses effective density `2` because existing Blueprint masses are lightweight relative to their metre-scale geometry; this validates the force path rather than realistic water scale. Directional Fields are simple force regions; baseline gravity remains Rapier's world gravity. Rain does not alter sensors, and Night changes only World daylight state and rendering because current range sensing has no optical model. No Windows validation was run; Phase 7 acceptance was exercised on the Mac browser and Rapier stack.

Implementation commits: `93631aa` (physics), `d446387` (world), `cf672fe` (browser scene). Pull request: [#11 — Phase 7: World & Environment](https://github.com/TTTT-T/Morphodyne/pull/11), targeting `main`. Stop at review; Phase 8A has not begun.
