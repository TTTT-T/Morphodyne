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
- Keep the Simulation Core independent from Unity wherever practical.
- Unity / PhysX is an execution backend, not the source of simulation semantics.
- Physics is the final arbiter of physical outcomes.

## Scope Discipline

- Work only on the active Phase.
- Do not implement later-phase features unless the current Phase explicitly requires an interface placeholder.
- Prefer the smallest implementation that validates the current architectural contract.
- Do not add speculative complexity for possible future needs.
- Do not create object-specific shortcuts merely to produce a visible demo.

## Modularity

- Break work into small, independently testable modules.
- Keep dependencies directional and explicit.
- Avoid large classes that own multiple simulation responsibilities.
- Every new module must have a clear ownership boundary.
- Core types and rules should remain testable without launching Unity whenever practical.

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
- Mac is the primary Codex, Git, Core development, documentation, and pure-C# test environment.
- Windows is the Unity / PhysX integration and performance-validation environment.
- Each machine keeps its own local repository clone and synchronizes through Git.
- Do not run the Unity project from an SMB or other network-mounted working tree.
- Mac-to-Windows SSH automation is desirable but must not block the active Phase unless explicitly required by that Phase.

## Git Workflow

- `main` is the accepted project baseline.
- Perform Phase work on the designated Phase branch.
- Do not develop directly on `main` unless explicitly instructed for repository administration or documentation maintenance.
- Do not rewrite accepted history or force-push.
- Preserve unrelated user changes.
- Commit completed logical units separately with descriptive commit messages.
- Before each implementation commit:
  1. run applicable tests;
  2. inspect the diff;
  3. verify no unrelated files changed.
- Keep generated caches, build outputs, local IDE state, credentials, and machine-specific artifacts out of Git.
- Leave the working tree clean when handing work off for review.

## Phase Completion

A Phase is not complete merely because implementation exists.

Before declaring a Phase complete:

1. Run all applicable automated tests.
2. Perform all validation required by the active Phase, including Windows / Unity validation when applicable.
3. Compare the implementation against Architecture and Roadmap.
4. Create or update the Phase report.
5. Commit all completed Phase work.
6. Push the designated Phase branch.
7. Create a pull request targeting `main`.
8. Stop at the review boundary.

Do not begin the next Phase until the current Phase has been reviewed and accepted.

## Review Handoff

The Phase report and pull request must make independent review possible without relying on chat history.

Include:

- what changed;
- why it changed;
- files and modules affected;
- tests performed and exact results;
- Mac validation results;
- Windows / Unity validation results when applicable;
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
