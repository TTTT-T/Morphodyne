# Phase 0 Kickoff — Project Foundation

Use `docs/ARCHITECTURE_v0.1.md`, `docs/ROADMAP_v0.1.md`, and root `AGENTS.md` as the governing project documents.

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
11. Follow the Git and review boundary defined in `AGENTS.md`.
12. At Phase 0 completion, stop and produce `PHASE0_REPORT.md`. Do not continue into Phase 1.

## Development environment

- Codex runs on the Mac mini.
- Mac is the primary code-development, Git, documentation, and pure-C# test environment.
- Windows PC is on the same LAN and is responsible for Unity 6.3 LTS / PhysX integration and later performance validation.
- Each machine should keep its own local repository clone and synchronize through Git.
- Do not run the Unity project directly from an SMB network-shared project directory.
- If practical, establish Mac → Windows SSH-based validation, but this must not block the core Phase 0 foundation.

### Environment setup policy

Environment setup begins with an **audit, not installation**.

Before installing or changing anything:

1. Inspect the Mac for the required development tools and versions.
2. Record what is already present and usable.
3. Identify only the missing prerequisites required by Phase 0.
4. Prefer project-local dependencies over unnecessary global installation.
5. Clearly identify system-level changes, elevated-privilege operations, or security-sensitive configuration before performing them.
6. Never store credentials, access tokens, passwords, or machine-specific secrets in the repository.

The Mac has limited internal storage. Treat storage use as a hard constraint:

- Do not install Unity Editor or Unity platform modules on Mac for Phase 0.
- Do not install Android/iOS toolchains, local AI models, Docker images, or other heavyweight dependencies unless explicitly required by a later Phase and approved by the user.
- Keep Mac dependencies limited to Codex, Git, minimum required .NET tooling, SSH, source code, documentation, and lightweight test dependencies.
- Prefer all Unity/PhysX integration, builds, large caches, binary assets, and heavyweight validation on Windows.
- Avoid duplicate SDK versions.
- Before any nontrivial installation, check free disk space and identify expected disk impact.
- Generated build outputs and caches must remain removable and must not be committed.

Create and maintain reproducible setup helpers:

- `scripts/bootstrap-mac.sh`
- `scripts/bootstrap-windows.ps1`

The bootstrap scripts should, where practical:

- detect already-installed prerequisites;
- avoid reinstalling satisfied dependencies;
- report available disk space and significant prerequisite footprints;
- fail clearly when manual intervention is required;
- avoid destructive system changes;
- document required versions or accepted version ranges;
- be safe to re-run.

For Phase 0, the Windows bootstrap may initially be a validation/setup helper rather than a fully unattended Unity installer if unattended installation would add unnecessary complexity or require credentials/licensing interaction.

## Phase 0 execution request

1. Read and review `AGENTS.md`, Architecture v0.1, and Roadmap v0.1.
2. Check for conflicts, impossible constraints, or significant engineering risks.
3. Audit the current Mac development environment, dependencies, and available disk space before installing anything.
4. Determine the minimal Phase 0 prerequisites and create/update the bootstrap scripts.
5. Produce an internal Phase 0 task breakdown with explicit acceptance criteria.
6. If there is no blocking architectural issue, begin Phase 0 directly.
7. Run all executable tests after implementation.
8. Perform Windows / Unity validation when the environment is available; if it is blocked by a clearly documented external prerequisite, report the exact blocker rather than fabricating a result.
9. Produce `PHASE0_REPORT.md` containing at minimum:
   - implemented work
   - final directory structure
   - module dependency relationships
   - environment audit results
   - Mac free-space status and any material disk usage added by setup
   - installed/required prerequisites
   - bootstrap script status
   - test results
   - Mac validation results
   - Windows / Unity validation results
   - known issues
   - any deviation from Architecture / Roadmap
   - recommendation on whether Phase 1 should begin
10. Commit logical work units during implementation as required by `AGENTS.md`.
11. At Phase completion, commit the final report, push `phase-0-foundation`, create a PR targeting `main`, and stop at the review boundary.

## Phase 0 minimum deliverables

- Unity project foundation.
- Core / PhysicsAdapter / Simulation / Tools module boundaries.
- Pure-C# Core assembly.
- Unit-test infrastructure.
- Minimal Physics Adapter shell.
- Basic logging conventions.
- Mac environment audit and build/test path.
- `scripts/bootstrap-mac.sh`.
- `scripts/bootstrap-windows.ps1`.
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

The purpose of Phase 0 is to create a clean, reproducible foundation, not a visible gameplay demo.
