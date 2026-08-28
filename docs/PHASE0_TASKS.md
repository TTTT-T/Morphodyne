# Phase 0 Task Breakdown

This checklist translates the Phase 0 kickoff into independently verifiable work. It does not authorize Phase 1 work.

## 1. Environment and repository

- Confirm the designated branch and clean starting state.
- Audit Git, .NET SDK, SSH, GitHub CLI, and free disk space before installation.
- Install only the minimum .NET SDK required for Mac Core builds and tests.

Acceptance: the audit is recorded in `PHASE0_REPORT.md`, and no heavyweight Unity or mobile tooling is installed on Mac.

## 2. Project and module foundation

- Create a minimal Unity 6.3 LTS project shell.
- Establish Core, PhysicsAdapter, Simulation, and Tools assemblies.
- Mirror those boundaries in a Mac-buildable .NET solution.
- Keep dependencies directional: Core <- PhysicsAdapter <- Simulation <- Tools, with Tools also allowed to inspect Core.

Acceptance: all assemblies build on Mac; Core has no Unity reference; project metadata names Unity 6.3 LTS as the Windows baseline.

## 3. Phase 0 Core model

- Implement only EntityId, Entity, Material, Part, Connection, Event, and Blueprint.
- Add invariant-focused unit tests.
- Do not add abilities, agent logic, locomotion, damage, sensors, skills, or environment behavior.

Acceptance: Core tests pass on Mac and forbidden capability fields are absent.

## 4. Adapter, simulation, and logging shells

- Add the smallest backend-neutral physics stepping contract.
- Add a fixed-step simulation shell that depends on the adapter, not Unity.
- Define structured logging conventions without coupling Core to a logging framework.

Acceptance: tests prove step forwarding and module direction; no PhysicsBody, Rigidbody, Joint, or Unity implementation is introduced.

## 5. Reproducible workflows

- Maintain idempotent Mac and Windows bootstrap helpers.
- Provide Mac build/test and dependency-boundary checks.
- Provide a Windows Unity pull/open/batch validation path without unattended editor installation.

Acceptance: Mac scripts pass locally; Windows-only checks clearly report prerequisites and remain pending until run on Windows.

## 6. Review handoff

- Run the complete executable test and architecture checks.
- Record exact results, disk impact, limitations, and pending Windows validation in `PHASE0_REPORT.md`.
- Commit logical units, push `phase-0-foundation`, and open a PR to `main`.

Acceptance: the working tree is clean, the PR contains independent review evidence, and no Phase 1 work is present.
