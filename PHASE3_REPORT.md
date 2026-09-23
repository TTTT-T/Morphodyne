# Phase 3 report — Damage & Dependency

Date: 2026-09-23 (Asia/Shanghai)
Base: `main` at `b117825`
Phase branch: `codex/phase-3-damage-dependency`

## Result

Physical impulses now change structural state and can remove a real Rapier joint. Core tracks material and Part deformation, residual Connection load capacity, fracture, separation, and factual events. Rapier reports per-step contact and applied impulses; the simulation shares an impacted Part's impulse among its remaining connections, evaluates the generic load rule after physics, and removes every failed joint. Detached Parts retain independent rigid bodies and colliders. The existing controller continues to emit the same signals; output addressed to a separated connection no longer transmits through a joint.

The browser keeps the Phase 2 active Blueprint as a neutral test structure. “Impact / Damage” applies an opposing physical impulse pair across one attachment, with no outcome flag or animation. Its weaker Connection can separate while the other assemblies remain connected. Three.js renders the Rapier poses and displays the structural state.

## Mac acceptance evidence

| Check | Result |
| --- | --- |
| `npm test` | 14 files, 45 tests passed; architecture import boundaries passed for 21 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0 |
| `git diff --check` | Passed |
| Core rules | Sub-yield load unchanged; repeated overload degrades capacity; stronger Connection and tougher Material withstand the same load; a fractured Part removes adjacent load paths |
| Rapier | Contact force produces measured impulse; direct impulse is recorded for one step; removing a joint leaves two independent bodies; subsequent actuator output to that joint has no physical effect |
| Active-body replay | After 2 s settling, the exact same 180-tick Forward actuator-signal sequence was replayed in all trials. No impact: 1.269 m forward progress, 1.745 m mean core height. The same 3 N·s opposed impulse pair left a 100 N·s Connection attached but reduced progress to -0.196 m and mean height to 1.143 m; with a 1 N·s Connection it separated at the impact tick, progress fell to -1.099 m, and mean height to 1.054 m. Detached Part center distance reached 2.484 m, versus 1.369 m with the strong Connection. A 0.2 N·s pair did not separate the weak Connection in the immediate 30-tick observation window. |
| Browser | Local Vite/WebGL showed the intact structure standing. In Forward mode, clicking “Impact / Damage” displayed `connection-0-a` separated within about 0.3 s; at 1.5 s its assembly had visibly shifted while Forward control remained active. Reset restored the intact scene. |

The strong structure also loses performance from the physical impact because the Phase 2 controller is fragile outside its short acceptance window. The matched strong/weak impact trials isolate the additional loss caused by separation.

## Scope and limits

The load distribution is a first-order equal share of Part impact impulse, not a solved joint reaction or finite-element stress field. Material deformation and residual capacities are Core state; this version changes Rapier constraints when a Connection fails, without continuous collider reshaping or joint compliance. No tear, crush, thermal damage, natural repair, or God Repair implementation was added. These are scoped deferrals from the broader Roadmap in favor of the requested minimum causal experiment; no Architecture principle was changed.

Windows was not run; Mac is the required development and browser environment here. The large Rapier-containing JavaScript chunk warning remains nonblocking.

Implementation spans `src/core`, `src/physics`, `src/simulation`, `src/tools`, `src/main.ts`, and `src/style.css`. Review the Phase 3 branch and pull request against `main`; do not begin Phase 4 before acceptance.

Implementation commits: `9080546` (Core), `926cfae` (Rapier), `2df6566` (simulation and browser). Pull request: [#6 — Phase 3: structural damage and dependency](https://github.com/TTTT-T/Morphodyne/pull/6), targeting `main`.
