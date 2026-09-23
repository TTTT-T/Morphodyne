# Morphodyne Agent Working Agreement

## Source of Truth

Read before implementation, in this order:

1. `docs/ARCHITECTURE_v0.1.md`
2. `docs/ROADMAP_v0.1.md`
3. The active Phase kickoff document

Architecture takes precedence over implementation convenience.

## Core Principles

- Entities have no predefined abilities; capabilities emerge from structure.
- Non-core systems may use low-fidelity implementations, but must not bypass core rules to manufacture outcomes.
- Prefer general rules and reusable interfaces over species-, machine-, or scenario-specific logic.
- If existing abstractions cannot express a requirement, review and improve the abstraction before adding special-case logic.
- Keep the Simulation Core independent from Three.js wherever practical.
- Three.js / Rapier is an execution backend, not the source of simulation semantics.
- Physics is the final arbiter of physical outcomes.

## Development Priority

Morphodyne exists to realize the project vision and validate the simulation ideas. Engineering process exists to support that goal, not to become the goal itself.

- Optimize for meaningful project progress per unit of effort.
- Prefer the smallest implementation or experiment that proves the next important causal capability.
- Tests, reports, abstractions, tooling, and documentation should be added when they materially reduce risk, preserve important knowledge, or accelerate later work.
- Do not spend substantial time maximizing test coverage, process completeness, documentation volume, infrastructure polish, or ceremonial workflow when they do not materially advance the simulation.
- Avoid building systems for hypothetical future needs before the active work requires them.
- When choosing between additional process and advancing a reversible, low-risk implementation, prefer advancing the implementation.
- Do not trade away core causal correctness, repository safety, or architectural boundaries merely for speed.

## Scope Discipline

- Work primarily on the active Phase and its acceptance goal.
- Do not implement later-phase features unless they are necessary to validate the active Phase or establish a required interface.
- Prefer the smallest implementation that validates the current architectural contract.
- Do not add speculative complexity for possible future needs.
- Do not create object-specific shortcuts merely to produce a visible demo.

## Modularity

- Break work into small modules with clear ownership boundaries.
- Keep dependencies directional and explicit.
- Avoid large classes that own multiple simulation responsibilities.
- Core types and rules should remain testable without launching Three.js wherever practical.
- Do not split code into extra modules merely to satisfy an abstract notion of purity; modularity should make the project easier to reason about, change, or delegate.

## Testing Strategy

Testing should be proportional to risk. The project does not optimize for test count or coverage percentage.

- Prioritize focused automated tests for core causal rules, structural validation, adapter contracts, deterministic logic, and previously observed regressions.
- Prefer a lightweight smoke test or direct browser validation for presentation, debug tooling, and simple integration paths when that gives sufficient confidence faster.
- Do not duplicate essentially identical tests across layers.
- During implementation, run the narrowest relevant checks first.
- Run the full test suite, typecheck, and build at important integration points and before Phase handoff or PR creation, rather than after every small edit.
- A Phase needs enough evidence to show its acceptance goal works; it does not require exhaustive validation of every possible future case.
- If a test is expensive to build and protects only low-risk or disposable code, defer it unless a real failure justifies the cost.

## Environment

- Inspect the existing environment before installing anything.
- Prefer existing tools when they satisfy the documented requirements.
- Project-local dependencies may be installed when required.
- Do not make unnecessary system-wide changes.
- Clearly identify any system-level installation or configuration that requires elevated privileges before performing it.
- Never hard-code credentials, tokens, machine-specific secrets, or private network details into the repository.
- Keep environment setup reproducible through:
  - `scripts/bootstrap-mac.sh`
  - `scripts/bootstrap-windows.ps1`
- Bootstrap scripts must be safe to re-run where practical and should detect already-satisfied prerequisites.
- Mac is the primary Codex, Git, Core development, documentation, browser development, and test environment.
- Windows is optional for later cross-platform and performance validation; it is not required for Phase 0.
- Each machine keeps its own local repository clone and synchronizes through Git.
- Do not run the Three.js project from an SMB or other network-mounted working tree.
- Mac-to-Windows SSH automation is desirable but must not block the active Phase unless explicitly required by that Phase.

### Mac Storage Policy

The primary Mac has limited internal storage. Treat disk usage as a hard engineering constraint.

- Do not install heavyweight IDEs, local AI models, Docker images, mobile SDKs, or unrelated toolchains on the Mac unless a later Phase explicitly requires them and the user approves the installation.
- Prefer the lightweight browser/Node toolchain on Mac. Use Windows only when later validation benefits from it.
- Keep the Mac environment intentionally small: Codex, Git, the minimum required Node.js tooling, SSH, source code, documentation, and lightweight test dependencies.
- Before installing any dependency expected to consume significant disk space, report its purpose and approximate footprint and wait for explicit approval if it is not required by the active Phase.
- Avoid duplicate SDK versions unless required for compatibility.
- Keep build outputs, package caches, temporary files, generated artifacts, and test results bounded and removable.
- Bootstrap scripts should report major disk consumers and available free space where practical.
- Do not store large build artifacts, datasets, model weights, or binary assets on the Mac merely for convenience.

## Agent Orchestration

The main agent is the project lead. It should control the overall objective, architecture, task decomposition, integration, and final review rather than personally implementing every bounded task.

- Prefer delegating well-scoped implementation, research, refactoring, test-writing, and investigation tasks to Luna subagents when Luna is available and delegation is likely to save time.
- Keep the main agent focused on the critical path: deciding what matters next, preserving architectural consistency, integrating results, and resolving cross-module tradeoffs.
- Give subagents narrow objectives, relevant constraints, expected outputs, and clear file/module ownership.
- Subagents may propose local improvements but must not silently redefine project architecture or core principles.
- Parallelize independent tasks when practical, but avoid coordination overhead that costs more time than it saves.
- Do not create dedicated verifier/reviewer subagents by default. The main agent is responsible for reviewing integrated work and deciding whether the Phase goal is satisfied.
- If a task is faster and clearer for the main agent to complete directly, do so; delegation is a speed tool, not a ritual.

## Git Workflow

- `main` is the accepted project baseline.
- Perform Phase work on the designated Phase branch.
- Do not develop directly on `main` unless explicitly instructed for repository administration or documentation maintenance.
- Do not rewrite accepted history or force-push.
- Preserve unrelated user changes.
- Commit completed logical units separately with descriptive commit messages.
- Before an implementation commit, use judgment:
  1. run the focused checks needed for the changed area;
  2. inspect the diff;
  3. verify no unrelated files changed.
- Do not rerun the entire validation matrix for every small commit when narrower checks are sufficient.
- Keep generated caches, build outputs, local IDE state, credentials, and machine-specific artifacts out of Git.
- Leave the working tree clean when handing work off for review.

## Phase Completion

A Phase is not complete merely because implementation exists.

Before declaring a Phase complete:

1. Run the focused automated tests and smoke checks needed to establish the Phase acceptance goal.
2. Run the project-wide typecheck/build and any other validation that is materially relevant to the changed system.
3. Compare the implementation against Architecture and Roadmap.
4. Create or update a concise Phase report containing the evidence needed for review.
5. Commit all completed Phase work.
6. Push the designated Phase branch.
7. Create a pull request targeting `main`.
8. Stop at the review boundary.

Do not add extra validation or reporting solely for ceremony. Phase completion evidence should be sufficient, concise, and decision-oriented.

Do not begin the next Phase until the current Phase has been reviewed and accepted.

## Review Handoff

The Phase report and pull request must make independent review possible without relying on chat history.

Include:

- what changed;
- why it changed;
- files and modules affected;
- tests performed and exact results;
- Mac validation results;
- Windows / Three.js validation results when applicable;
- known limitations;
- architecture deviations;
- unresolved risks;
- commit and pull-request information.

Review feedback must be addressed on the existing Phase branch and pull request unless explicitly instructed otherwise.

## Documentation

- Keep durable architectural knowledge in `docs/`.
- Keep this `AGENTS.md` focused on working rules rather than duplicating full design documents.
- Architectural changes require documentation of both the change and its rationale.
- Do not silently alter frozen principles to accommodate implementation shortcuts.
