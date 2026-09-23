# Phase 0 development

Run `npm ci`, then `npm test`, `npm run typecheck`, `npm run build`, and `npm run dev` from the repository root. Open the Vite URL in a WebGL-capable browser. The status overlay exposes the simulation tick and the Rapier body's height; the cube should fall from y=4 and rest around y=0.5 on the floor. This scene checks adapter wiring only. Blueprint-to-body mapping belongs to Phase 1.

`scripts/bootstrap-mac.sh` checks the Mac toolchain and disk space, installs only project-local packages from `package-lock.json`, and runs the checks. `scripts/bootstrap-windows.ps1` provides the optional Windows equivalent. Node.js 22.12+, 24.x or 26+ is required by the pinned Vite/Vitest toolchain. Neither script installs Node.js, browsers, or system-wide dependencies.

## Module direction

```text
main / tools → simulation → physics interface → Rapier adapter
           ↘ rendering → Three.js
core model → used by physics and rendering as framework-free data
```

- `src/core`: identities, structural data, factual events and Blueprint validation. It imports no backend.
- `src/physics`: backend-neutral primitives and Rapier implementation. Phase 0 creates boxes for the smoke scene; structural mapping is deferred.
- `src/rendering`: Three.js presentation. It receives poses and cannot advance physics.
- `src/simulation`: fixed-step time ownership, pause, single step and slow motion. It calls only the physics interface.
- `src/tools`: smoke-scene assembly and structured logging.

`npm test` runs `scripts/check-boundaries.mjs` before tests. The checker enforces import direction for the four architecture layers. It does not attempt to prove all runtime behavior; tests and browser validation cover the active path.

## Rationale

The repository starter placed Rapier stepping and Three mesh updates directly in `main.ts`. Moving those responsibilities into adapters and the simulation clock makes the Phase 0 ownership rules executable without implementing Phase 1 Blueprint-to-rigid-body construction. The smoke scene remains a backend integration check, not a game outcome or ability system.
