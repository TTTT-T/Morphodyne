# Morphodyne Phase 0 Report

Date: 2026-08-28 (Asia/Shanghai)

Branch: `phase-0-foundation`

Target: `main`

## Outcome

The Phase 0 implementation that can be completed and verified on the Mac is complete. The repository now has a minimal Unity 6.3 LTS project shell, pure-C# Core, explicit module boundaries, unit tests, a backend-neutral physics stepping boundary, fixed-step simulation shell, logging conventions, and reproducible Mac/Windows workflows.

Phase 0 is **not accepted yet**. Windows Unity validation and external PR review remain required. Phase 1 must not begin until both gates pass.

## Governing-document review

`AGENTS.md`, `docs/ARCHITECTURE_v0.1.md`, `docs/ROADMAP_v0.1.md`, and `docs/PHASE0_KICKOFF.md` were read in full before implementation.

No blocking conflict or impossible Phase 0 requirement was found. The Architecture describes the full v0.1 concept set, while Roadmap/Kickoff deliberately restrict Phase 0 implementation to EntityId, Entity, Material, Part, Connection, Event, and Blueprint. The narrower active-phase scope was followed.

The Roadmap acceptance item requiring Windows to open and run the same Unity project revision cannot be verified from the current Mac-only session. The user explicitly allowed this external prerequisite to remain pending without lowering the acceptance standard.

## Implemented work

- Minimal Unity project metadata for the documented Unity 6.3 LTS baseline.
- Unity assemblies and matching .NET projects for Core, PhysicsAdapter, Simulation, and Tools.
- Pure-C# Core types:
  - EntityId
  - Entity
  - Material
  - Part
  - Connection and generic ConnectionKind
  - Event and generic EventKind
  - Blueprint
- Structural invariants for nonempty identifiers, finite physical values, unique part/connection IDs, and internal connection endpoints.
- Minimal backend-neutral `IPhysicsAdapter.Step(PhysicsStep)` boundary.
- Minimal fixed-step simulation coordinator that advances only after a successful backend step.
- Structured diagnostic logging contract and console sink, kept separate from world Event records.
- xUnit-based unit-test infrastructure and architecture-boundary tests.
- Unity `.meta` coverage for tracked Assets.
- Reproducible environment and validation helpers:
  - `scripts/bootstrap-mac.sh`
  - `scripts/build-test-mac.sh`
  - `scripts/validate-architecture.sh`
  - `scripts/bootstrap-windows.ps1`
  - `scripts/validate-windows.ps1`
- Mac/Windows/SSH workflow documentation and Phase 0 task checklist.

No Agent AI, animals, locomotion, quadruped implementation, Damage system, sensors, perception behavior, skills, learning, environment simulation, editor tooling, ecology, evolution, or natural-language creation was added.

## Final directory structure

```text
Morphodyne/
├── Assets/Morphodyne/
│   ├── Core/
│   ├── PhysicsAdapter/
│   ├── Simulation/
│   │   └── Logging/
│   └── Tools/
│       └── Logging/
├── Packages/manifest.json
├── ProjectSettings/ProjectVersion.txt
├── dotnet/
│   ├── Morphodyne.Core/
│   ├── Morphodyne.PhysicsAdapter/
│   ├── Morphodyne.Simulation/
│   ├── Morphodyne.Tools/
│   └── Morphodyne.Core.Tests/
├── scripts/
│   ├── bootstrap-mac.sh
│   ├── bootstrap-windows.ps1
│   ├── build-test-mac.sh
│   ├── validate-architecture.sh
│   └── validate-windows.ps1
├── docs/
│   ├── ARCHITECTURE_v0.1.md
│   ├── DEVELOPMENT.md
│   ├── LOGGING.md
│   ├── PHASE0_KICKOFF.md
│   ├── PHASE0_TASKS.md
│   └── ROADMAP_v0.1.md
├── Directory.Build.props
├── global.json
├── Morphodyne.sln
└── PHASE0_REPORT.md
```

## Modules and dependencies

```text
Morphodyne.Core                    (no project/package/Unity dependencies)
        ↑
Morphodyne.PhysicsAdapter          (Core; backend-neutral contract only)
        ↑
Morphodyne.Simulation              (Core + PhysicsAdapter)
        ↑
Morphodyne.Tools                   (Core + Simulation)

Morphodyne.Core.Tests              (test-only references to all Phase 0 modules)
```

Unity `.asmdef` files and .NET `ProjectReference` entries express the same direction. Core has `noEngineReferences: true`; all Phase 0 runtime assemblies are currently Unity-engine-free. A future Unity/PhysX implementation must be a separate backend assembly rather than adding UnityEngine to Core.

## Environment audit

Audit time: 2026-08-28 10:07 CST.

| Item | Result |
|---|---|
| macOS | 26.6, arm64 (reported by .NET runtime) |
| Git | 2.50.1, existing `/usr/bin/git` |
| SSH client | OpenSSH 10.3p1, existing `/usr/bin/ssh` |
| ripgrep | 15.1.0, existing Homebrew installation |
| GitHub CLI | 2.87.3; `gh auth status` reported an invalid saved token at audit time, but authenticated PR creation later succeeded |
| .NET before setup | Not installed or available in PATH; no reusable Mono/MSBuild toolchain found |
| .NET after setup | SDK 8.0.130, runtime 8.0.30, arm64; no workloads installed |
| Unity on Mac | Not installed, by design |
| Windows/Unity | Not reachable or executed in this session; pending validation |

Initial filesystem observation showed approximately 74 GiB available. The final `df -h` observation also showed approximately 74 GiB available (77,086,672 KiB reported by `df -k`). Rounded filesystem values fluctuate with unrelated system activity and snapshots.

## Installed dependencies and disk impact

Installed exactly one required formula:

- Homebrew `dotnet@8` 8.0.130, required to compile and test pure C# Core on Mac.
- Homebrew install output reported 510.3 MB; `du -sh` later measured 494 MB in the Cellar.
- No .NET workloads were installed.
- No Unity Editor, Unity platform modules, Android/iOS tools, Xcode components, Docker images, local AI models, or other heavyweight project dependencies were installed.

Removable project-local state at final audit:

- `.cache/`: 92 MB, primarily pinned NuGet test packages and .NET CLI state; ignored by Git.
- `dotnet/`: 6.0 MB including ignored build outputs at audit time.
- `Assets/`: 188 KB.
- `.git/`: 588 KB before the final report commit.

## Bootstrap status

### Mac

`scripts/bootstrap-mac.sh` was executed successfully. It detected Git, SSH, ripgrep, .NET 8, free disk, and optional GitHub CLI. It is read-only by default and requires explicit `--install-missing` before invoking Homebrew.

`scripts/build-test-mac.sh --no-restore` was executed successfully using project-local cache paths and non-shared single-process MSBuild settings. These settings avoid restricted-environment build-server hangs and keep generated state removable.

All Bash scripts passed `bash -n`. `shellcheck` was not installed and was not added solely for Phase 0.

### Windows

The PowerShell scripts were created and reviewed but could not be executed because PowerShell/Windows/Unity were not available in the Mac session. The Windows bootstrap only audits prerequisites and leaves Unity Hub installation/licensing as an explicit manual step. The validation script runs .NET tests, Unity batch open/import/compile, log scanning, and requests a manual Console check.

## Tests and exact results

Final Mac command:

```bash
scripts/build-test-mac.sh --no-restore
```

Final result:

- Release build: succeeded.
- Assemblies built: Core, PhysicsAdapter, Simulation, Tools, Core.Tests.
- Build warnings: 0.
- Build errors: 0.
- Unit tests: 13 passed, 0 failed, 0 skipped.
- Reported test duration: 24 ms.
- Architecture checks: 5 passed.
  - Core contains no Unity runtime symbols.
  - Forbidden predefined capability fields are absent.
  - Core .NET project has no project or package dependencies.
  - Core Unity assembly prohibits engine references.
  - Every tracked Unity asset/folder has a `.meta` file.

An earlier sandboxed test attempt was aborted before test execution because VSTest could not bind its local loopback socket (`Permission denied`). The identical suite was rerun with host permission and passed 13/13. Earlier shared-server builds that stalled in the restricted environment were terminated; the reproducible scripts now disable shared build servers and subsequently passed.

## Mac validation

Verified live on Mac:

- Repository is on `phase-0-foundation`, not `main`.
- All four runtime assemblies compile against `netstandard2.1` using .NET 8 SDK.
- Core unit tests execute without Unity.
- Core assembly references contain neither Unity nor other Morphodyne runtime assemblies.
- No forbidden capability properties exist in the public Core surface or source scan.
- Fixed-step adapter forwarding and failure behavior are covered by tests.
- Bootstrap is rerunnable and uses bounded, ignored project-local caches.
- Generated build/cache state is not tracked.

## Pending Windows / Unity validation

Status: **pending Windows validation; not passed**.

Required before Phase 0 acceptance:

1. Clone/pull this exact branch revision into a local Windows filesystem.
2. Run `scripts\bootstrap-windows.ps1` and record the exact Unity 6.3 LTS patch.
3. Run `scripts\validate-windows.ps1`.
4. Confirm .NET tests pass on Windows.
5. Confirm Unity batchmode opens, imports, and compiles with no errors.
6. Open the project through Unity Hub and confirm the Console is clean and the project can enter/exit Play Mode.
7. Review any Unity-generated ProjectSettings or package-lock changes; commit only intentional version metadata.
8. Add the actual Windows/Unity evidence to this report or the existing PR before acceptance.

The optional Mac-to-Windows SSH plan is documented in `docs/DEVELOPMENT.md`; no machine-specific host, address, username, or credential was stored.

## Known issues and unresolved risks

- Windows/Unity acceptance is still pending; directory/configuration presence is not runtime proof.
- `ProjectVersion.txt` uses the documented Unity 6.3 LTS baseline `6000.3.0f1`, not a claim about the latest available patch. An approved patch upgrade must be validated and reviewed on Windows.
- The minimal Unity shell may generate additional version-specific ProjectSettings or package lock data on first real import.
- PowerShell scripts have not been parsed or executed by Windows PowerShell in this session.
- Material values currently enforce only general finite/nonnegative invariants. Units, coordinate conventions, serialization schema, and detailed physical interpretation are not yet frozen by Architecture v0.1.
- Event facts use a minimal text fact plus optional causal ID. A typed event payload design remains future work and must not be expanded without the responsible phase.
- GitHub CLI's auth diagnostic reported an invalid saved token, although push and authenticated PR creation both succeeded. The stale credential entry should be cleaned up separately; it did not block this handoff.

## Architecture deviations

No intentional deviation from Architecture v0.1, Roadmap v0.1, or Phase 0 Kickoff was introduced.

Deliberate Phase-boundary omissions are not deviations:

- Part geometry and Part-to-Rigidbody mapping are Phase 1.
- Connection-to-Joint mapping is Phase 1.
- PhysicsBody is Phase 1.
- Damage state/behavior, actuators, sensors, skills, agents, and environment behavior remain deferred to their documented phases.

## Git and review handoff

Logical implementation commits before this report:

- `cc77214` — build: establish Phase 0 project foundation
- `62d097e` — feat: add Phase 0 core model and boundaries
- `de21c03` — chore: add reproducible Phase 0 workflows
- `264dc8f` — test: verify Unity asset metadata coverage
- `46d98d8` — docs: add Phase 0 validation report

Pull request: [#1 — Phase 0: establish project foundation](https://github.com/TTTT-T/Morphodyne/pull/1)

PR status at handoff: open, targeting `main`, not merged.

## Phase 1 readiness recommendation

**Do not begin Phase 1 yet.**

The Mac-side technical foundation is ready for external review and Windows validation. Technical permission to enter Phase 1 should be granted only after the exact PR revision passes Unity 6.3 LTS validation on Windows and the Phase 0 PR is reviewed and accepted.
