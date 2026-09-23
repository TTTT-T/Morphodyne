# Development and Phase 1 validation

Run `npm ci`, then `npm test`, `npm run typecheck`, `npm run build`, and `npm run dev` from the repository root. Open the Vite URL in a WebGL-capable browser. The Phase 1 scene shows a passive five-Part Blueprint with four fixed connections settling on the ground. The status overlay exposes the simulation tick, Part count, and center height; the center settles near y=1.80. Automated physics experiments compare mass, geometry, restitution, and joint limits.

`scripts/bootstrap-mac.sh` checks the Mac toolchain and disk space, installs only project-local packages from `package-lock.json`, and runs the checks. `scripts/bootstrap-windows.ps1` provides the optional Windows equivalent. Node.js 22.12+, 24.x or 26+ is required by the pinned Vite/Vitest toolchain. Neither script installs Node.js, browsers, or system-wide dependencies.

## Module direction

```text
main / tools → simulation → physics interface → Rapier adapter
           ↘ rendering → Three.js
core model → used by physics and rendering as framework-free data
```

- `src/core`: identities, structural data, factual events and Blueprint validation. It imports no backend.
- `src/physics`: backend-neutral `PhysicsBody` contract and Rapier implementation. It maps each Part to a rigid body/collider and each Connection to a joint.
- `src/rendering`: Three.js presentation. It receives poses and cannot advance physics.
- `src/simulation`: fixed-step time ownership, pause, single step and slow motion. It calls only the physics interface.
- `src/tools`: passive Blueprint fixture and structured logging.

`npm test` runs `scripts/check-boundaries.mjs` before tests. The checker enforces import direction for the four architecture layers. It does not attempt to prove all runtime behavior; tests and browser validation cover the active path.

## Rationale

The repository starter placed Rapier stepping and Three mesh updates directly in `main.ts`. The adapters and simulation clock keep time, physics execution, and presentation separate. The Phase 1 Blueprint now crosses the physics boundary through `createBody`, while Three.js only displays returned poses.
