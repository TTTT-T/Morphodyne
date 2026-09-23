# Phase 4 report — Sensor & Perception

Date: 2026-09-23 (Asia/Shanghai)
Base: `main` at `7340b0c`
Phase branch: `codex/phase-4-sensor-perception`

## Result

The active body now receives control feedback from mounted Sensors rather than direct Physics reads. The causal path is Rapier physical state → `SensorRuntime` → timestamped `Observation` → expiring `Perception` → controller input. `readAgentView()` returns copied sensor-local numeric measurements; it contains no PhysicsAdapter, target Entity identity, Blueprint, material, damage state, world position of targets, or semantic object label. Rendering and the god/debug UI may still inspect physical state for display; these are outside the agent-facing view.

Core declares Part-mounted Contact, Proprioception, and directional Range Sensors with local pose, range or field, resolution, update period, latency, and uncertainty. Structural reachability from the root Part and current Part fracture state control sensor availability. On separation, the sensor remains mounted to its physical Part while the original body loses its observations in the same tick. A seeded noise source supplies repeatable first-order uncertainty. Perception has its own expiry and confidence instead of becoming permanent world truth.

Rapier supplies narrow-phase contact points and impulses, current Part angular velocity, and first-hit raycasts. The ray excludes only the mounting Part, so another surface, including a separated Part, can physically occlude it. The active scene includes two simple physical targets and a range ray drawn by Three.js from the mounting pose.

## Mac acceptance evidence

| Check | Result |
| --- | --- |
| `npm test` | 17 files, 57 tests passed; architecture import boundaries passed for 25 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0 |
| `git diff --check` | Passed |
| Contact | A free applied impulse yielded no contact observation; falling into the ground produced a measured local contact point and positive contact impulse |
| Proprioception | Sensor read current orientation, angular velocity, relative Part pose, joint position, and joint velocity from the live body |
| Range / occlusion | Rays returned the nearest physical surface within range and field; a farther collinear collider was occluded; a target moved beyond range disappeared at the next sensor update |
| Mount / damage | Rotating the mounting Part changed detection direction. A measured impact separated `connection-0-a`; the original root immediately lost its mounted range sensor and its observations |
| Browser | Local Vite/WebGL initially displayed `Sensors 3/3 · range 3, nearest 1.50 m`. After “Impact / Damage”, it displayed `Separated: connection-0-a` and `Sensors 1/3 · range 0`. Reset restored the intact scene. |

## Scope and limits

Range samples are anonymous first-hit rays, not object recognition or a count of unique targets. The first Perception pass keeps measured channels with confidence and expiry; it does not infer persistent objects, build a world map, or make AI decisions. No dedicated camera/image Visual Sensor, Self Model, or World Model was added. The requested minimum sensing boundary and range-based occlusion experiment take priority over those broader Roadmap items; no Architecture principle changed. Noise, contact impulse, and relative pose use low-fidelity scalar quantization/uncertainty, with no biological fidelity claim.

Windows was not run; Mac is the required environment for this Phase. The existing large Rapier-containing JavaScript chunk warning remains nonblocking. The agent-facing type is a contract for the future Brain, not a security sandbox against arbitrary application code; Phase 5 must accept the perception view rather than a PhysicsAdapter or runtime body.

Implementation touches `src/core`, `src/physics`, `src/simulation`, `src/tools`, `src/rendering`, `src/main.ts`, and `src/style.css`. Implementation commits: `2ef7781`, `bd5fee5`, and `9bc5cb8`; report commit: `278c257`. Pull request: [#7 — Phase 4: sensor and perception boundary](https://github.com/TTTT-T/Morphodyne/pull/7), targeting `main`.
