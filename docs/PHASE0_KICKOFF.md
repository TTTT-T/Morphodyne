# Phase 0 Kickoff — Project Foundation

Use `docs/ARCHITECTURE_v0.1.md` and `docs/ROADMAP_v0.1.md` as the highest-priority project documents.

Current scope is **Phase 0 only**. Do not begin Phase 1 work before explicit acceptance.

## Working rules

1. Prioritize correct universal interfaces and basic rules over feature breadth.
2. Keep the project modular. Break work into small independently testable tasks.
3. Keep Core Simulation as pure C# wherever practical. Core must not depend on `MonoBehaviour`, `GameObject`, `Transform`, or UnityEngine runtime types.
4. Unity / PhysX must be accessed through a Physics Adapter boundary. Core world rules must not depend on Unity implementation details.
5. Concrete animals, machines, or scenes must not bypass universal rules through object-specific logic.
6. Do not introduce predefined capability properties such as `canWalk`, `attackPower`, `biteDamage`, or `moveSpeed`.
7. Do not implement animals, AI, detailed Damage, rich editor tooling, or later-phase features merely to produce an early demo.
8. If architecture documentation is insufficient, identify the gap explicitly instead of expanding project scope silently.
9. Keep project documentation synchronized with any architectural change, including the reason for the change.
10. Each independent module should have automated tests where feasible.
11. At Phase 0 completion, stop and produce `PHASE0_REPORT.md`. Do not continue into Phase 1.

## Development environment

- Codex runs on the Mac mini.
- Mac is the primary code-development, Git, documentation, and pure-C# test environment.
- Windows PC is on the same LAN and is responsible for Unity 6.3 LTS / PhysX integration and later performance validation.
- Each machine should keep its own local repository clone and synchronize through Git.
- Do not run the Unity project directly from an SMB network-shared project directory.
- If practical, establish Mac → Windows SSH-based validation, but this must not block the core Phase 0 foundation.

## Phase 0 execution request

1. Read and review Architecture v0.1 and Roadmap v0.1.
2. Check for conflicts, impossible constraints, or significant engineering risks.
3. Inspect the current development environment and dependencies.
4. Produce an internal Phase 0 task breakdown with explicit acceptance criteria.
5. If there is no blocking architectural issue, begin Phase 0 directly.
6. Run all executable tests after implementation.
7. Produce `PHASE0_REPORT.md` containing at minimum:
   - implemented work
   - final directory structure
   - module dependency relationships
   - test results
   - Mac validation results
   - Windows / Unity validation results
   - known issues
   - any deviation from Architecture / Roadmap
   - recommendation on whether Phase 1 should begin
8. Stop at the Phase 0 acceptance point.

## Phase 0 minimum deliverables

- Unity project foundation.
- Core / PhysicsAdapter / Simulation / Tools module boundaries.
- Pure-C# Core assembly.
- Unit-test infrastructure.
- Minimal Physics Adapter shell.
- Basic logging conventions.
- Mac build/test path.
- Windows Unity pull/open/run path.
- Initial minimal Core concepts only:
  - EntityId
  - Entity
  - Material
  - Part
  - Connection
  - Event
  - Blueprint

## Explicit exclusions

Do not implement in Phase 0:

- Agent AI
- animals
- locomotion
- detailed damage simulation
- learning
- complex editor tooling
- ecology
- evolution
- natural-language creation

The purpose of Phase 0 is to create a clean foundation, not a visible gameplay demo.
