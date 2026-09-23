# Phase 2 report — Actuator & Active Body

Date: 2026-09-23 (Asia/Shanghai)  
Base: `main` at `eff3e09`  
Phase branch: `codex/phase-2-actuator-active-body`

## Result

The Phase 1 Blueprint now supports generic joint actuators. A control signal is bounded to [-1, 1]; the runtime converts it to a force or torque within the actuator's output and available mechanical-power ceilings. Each fixed step submits equal and opposite effort to the two Rapier bodies joined by a revolute or prismatic Connection. Rapier owns poses, contacts and the actual motion. No Part has a predefined movement ability, and no controller writes a Transform or Pose.

The active test Blueprint has a central body, four identical articulated support assemblies with spherical end contacts, and one central inertial joint: 14 Parts, 13 revolute Connections, 13 Actuators. The controller uses joint position/velocity and body orientation feedback for posture, plus a small phase policy for movement attempts. The browser provides Stand, Forward, Turn left/right and External impact controls; the impact button launches a dynamic Rapier box into the assembly.

## Evidence on Mac

| Check | Result |
| --- | --- |
| `npm test` | Passed: 11 files, 34 tests; architecture import boundaries passed for 17 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0 |
| `git diff --check` | Passed |
| Fixed-step physical acceptance | After 2 s settling plus 3 s control: Stand core y > 1.7 m; Forward moved > 0.5 m in the body-forward (-Z) direction with core y > 1.1 m; Turn changed yaw by > 0.2 rad with core y > 0.9 m; external box impact changed core Z by > 0.05 m; zero available power did not produce comparable forward displacement |
| Physical parameter experiment | Doubling Part masses, halving actuator outputs, or lowering friction each changed the same trial's final Z by > 0.05 m |
| Browser scene | Local Vite/WebGL showed the articulated body standing and all controls. Forward changed the displayed position; Turn changed orientation visibly; the dynamic impact box contacted the body and changed its position. |

The existing large JavaScript chunk warning remains nonblocking. Windows was not run; Mac is the required development environment for this Phase.

## Limits and review

The demonstrated forward and turn motions are crude. A sustained Forward input can tip the body after the short acceptance window; this is not a stable gait or recovery policy. The energy contract represents available power only, without stored fuel, heat or fatigue. The impact experiment proves physical response, not guaranteed recovery from every collision. These limits do not alter the Architecture or Roadmap principles and are not hidden by outcome-setting logic.

Implementation is in `src/core`, `src/physics`, `src/simulation`, `src/tools`, `src/main.ts` and `src/style.css`. Review the branch and PR against `main`; Phase 3 has not begun.
