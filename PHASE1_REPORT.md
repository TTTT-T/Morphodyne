# Phase 1 report — Structural Physics

Date: 2026-09-23 (Asia/Shanghai)  
Base: `main` at `7f52f2a`  
Phase branch: `codex/phase-1-structural-physics`

## What changed

- Core Blueprints now describe Box, Sphere, Capsule, and Convex Part geometry; local Part poses; optional mass overrides; Material density, friction, and restitution; and generic rigid, revolute, and prismatic Connections with anchors, axes, and optional limits. Validation rejects invalid dimensions, poses, references, and misaligned initial connection frames.
- The backend-neutral `PhysicsBody` maps one Entity instance to stable Part/Connection handles and read-only Part poses. The Rapier adapter creates one dynamic rigid body and collider per Part, one joint per Connection, and applies Material properties to colliders. Morphodyne owns the structure and fixed step; Rapier determines motion; Three.js displays returned poses.
- The browser scene now shows a passive five-Part, four-Connection assembly with no ability, species, AI, actuator, sensor, damage, or movement rules. Files are concentrated in `src/core`, `src/physics`, `src/rendering`, `src/tools`, and `src/main.ts`.

## Validation on Mac

| Evidence | Result |
| --- | --- |
| `npm test` | Passed: 5 files, 14 tests; import boundaries passed for 10 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0 |
| Browser, local Vite + WebGL | Five-Part structure visible; at about tick 916 the center remained at y=1.80 |
| Passive assembly, 240 fixed steps | Five bodies and four joints created; center and all four supports settled within expected positions |
| Mass and proportions | Equal impulses moved a 1 kg sphere more than twice as far as a 4 kg sphere; differently sized bodies settled at their geometry-dependent heights |
| Material | Changing restitution from 0 to 1 increased rebound apex by more than 0.4 m in the same drop experiment |
| Connections | A 1 m prismatic range allowed over 0.35 m more relative travel than a 0.1 m range; external torque produced relative rotation at a revolute joint but not a fixed joint |
| Geometry and initial frames | A convex collider fell under gravity; a fixed joint retained a Part's initial quarter-turn orientation |

Windows was not run; it is optional for this Phase. The browser scene is a visual and runtime check, not a locomotion demonstration.

## Limits and review

No Architecture or Roadmap principles were changed. Initial non-rigid joint axes use the same local vector in both connected Part frames; the Blueprint validator requires those axes and anchors to align in the initial pose. This phase provides passive rigid-body structure only. The build still reports the existing large JavaScript chunk warning; it does not prevent the scene from running.

Implementation commits: `041d682` (Core), `4709b82` (Physics), `4cba541` (passive scene); report commit: `3a672d0`. Pull request: [#4 — Phase 1: structural Blueprint physics](https://github.com/TTTT-T/Morphodyne/pull/4), targeting `main`. Stop at review; Phase 2 has not begun.
