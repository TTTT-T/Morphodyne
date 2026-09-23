# Phase 0 report — Three.js / Rapier foundation

Date: 2026-09-23 (Asia/Shanghai)

Base: `main` at `d8cc121`

Phase branch: `codex/phase-0-foundation-threejs`

## Implemented work

- Added framework-independent Core types: EntityId, Entity, Material, Part, Connection, factual WorldEvent, Blueprint, and structural validation. No predefined capability fields were added.
- Split the starter scene into a backend-neutral physics interface, Rapier primitive adapter, Three.js presentation adapter, Morphodyne fixed-step simulation clock, and smoke-scene setup.
- Added structured logging, Core/Simulation/Rapier tests, import-boundary checks, a Vite CSS type declaration, and a pinned npm lockfile.
- Made Mac bootstrap reproducible with `npm ci`; added an optional Windows validation helper and development documentation.
- Kept Blueprint-to-rigid-body mapping, joints, actuators, agents, damage, and other Phase 1+ work out of scope.

## Directory structure and dependencies

```text
src/core/       framework-free structural model and validation
src/physics/    PhysicsAdapter contract and Rapier implementation
src/rendering/  Three.js presentation of supplied poses
src/simulation/ Morphodyne fixed-step clock
src/tools/      smoke-scene setup and logging
scripts/        Mac and Windows bootstrap; import-boundary check
docs/           architecture, roadmap, kickoff, development workflow
```

`main` / Tools orchestrates Simulation, Physics, and Rendering. Simulation calls only the PhysicsAdapter contract. Physics maps backend-neutral box primitives to Rapier. Rendering receives pose values and controls only Three.js objects. Core imports neither backend. `npm test` checks these import directions. The smoke scene is a technical backend check; structural Blueprint mapping is explicitly reserved for Phase 1.

## Environment audit and setup

| Item | Result |
| --- | --- |
| Git | 2.54.0 (Apple Git-157), already installed |
| Node.js | v26.7.0, already installed |
| npm | 11.19.0, already installed |
| Disk free | 78 GiB before and after setup (APFS display precision) |
| Project dependencies | `npm ci` from `package-lock.json`; about 109 MiB in `node_modules` |
| Build output | about 3.2 MiB in ignored `dist` |
| System-wide installs | None |

The Mac bootstrap was run successfully and is safe to rerun. The Windows bootstrap was added as an optional helper; it was not executed on Windows. No Unity, Docker, local model, or unrelated heavyweight tooling was installed. The old local checkout and its cache were removed at the user's request before implementation continued in the repository root.

## Validation

| Check | Result |
| --- | --- |
| `npm run test` | Passed: 3 test files, 6 tests; import boundaries passed for 8 TypeScript files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Vite 8.3.0 |
| `bash scripts/bootstrap-mac.sh` | Passed: clean dependency install, tests, typecheck, build |
| `bash -n scripts/bootstrap-mac.sh` | Passed |
| Mac browser smoke scene | Passed: WebGL scene visible; cube fell from about y=4 to y=0.50 and remained on the floor while tick increased |
| Windows / cross-platform browser | Not run; optional for Phase 0 |

The initial `main` baseline had failing typecheck/build because the CSS side-effect import lacked a Vite type declaration. That was fixed. Browser validation exposed a first-frame timestamp mismatch; it was fixed by initializing elapsed time from the first animation frame, then the scene was reloaded and accepted.

## Known limitations and risks

- The production JavaScript bundle is about 3.38 MB before gzip and Vite warns about a chunk over 500 kB. This contains the current Three.js/Rapier smoke scene; bundle splitting is deferred because it does not affect Phase 0 acceptance.
- The Core model is intentionally minimal. It does not yet map Blueprints into physical bodies, calculate capabilities, or produce structural outcomes. Those are later-phase tasks.
- The optional Windows bootstrap has not been exercised on Windows.

## Architecture and workflow review

No Architecture or Roadmap principles were changed. The implementation keeps Three.js as presentation, Rapier as the physics executor, and Morphodyne as owner of simulation timing and structural semantics. No Phase 1 work was started. The kickoff named `phase-0-foundation` as the designated branch, but that remote branch already contains the earlier Unity history; this work uses `codex/phase-0-foundation-threejs` from the accepted Three.js/Rapier `main` baseline so it does not rewrite existing history.

Implementation commits: `8962da9` (Core and adapters), `949edaf` (reproducible setup and documentation). Initial report commit: `2448ccb`. Pull request: [#3 — Phase 0: establish Three.js/Rapier foundation](https://github.com/TTTT-T/Morphodyne/pull/3), targeting `main`.

Recommendation: review and accept this Phase 0 foundation before authorizing Phase 1. Do not begin Phase 1 from this handoff.
