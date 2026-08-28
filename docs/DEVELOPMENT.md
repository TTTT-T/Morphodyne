# Development Workflows

Phase 0 keeps pure C# work on Mac and Unity/PhysX validation on a local Windows checkout. Do not run the Unity project from a network share.

## Mac: audit, build, and test

From the repository root:

```bash
scripts/bootstrap-mac.sh
scripts/build-test-mac.sh
```

The bootstrap is read-only by default. If .NET 8 is missing and Homebrew is already available, installation requires an explicit opt-in:

```bash
scripts/bootstrap-mac.sh --install-missing
```

The workflow uses project-local removable state under `.cache/`. Use `scripts/build-test-mac.sh --no-restore` after a successful restore when working offline.

## Windows: local Unity validation

Keep a separate local-disk clone on Windows. In PowerShell:

```powershell
git clone --branch phase-0-foundation https://github.com/TTTT-T/Morphodyne.git
Set-Location Morphodyne
scripts\bootstrap-windows.ps1
scripts\validate-windows.ps1
```

Use `scripts\validate-windows.ps1 -Pull` only when the Windows worktree is clean and a fast-forward update is intended. The script:

1. verifies the Phase 0 branch;
2. runs the same .NET tests;
3. locates an installed Unity 6.3 LTS editor;
4. opens/imports/compiles the project in Unity batchmode;
5. scans the Unity log for compilation and batchmode errors.

After batch validation, open the project through Unity Hub and confirm manually that the Console is clean. Record the exact editor patch and results in `PHASE0_REPORT.md`. Do not claim Windows acceptance until these steps have actually run.

`ProjectVersion.txt` records the Unity 6.3 LTS baseline `6000.3.0f1`. A later approved 6000.3 patch may upgrade the project metadata during real Windows validation; that change and its result must be reviewed and committed explicitly.

## Optional Mac to Windows SSH

SSH automation is an optional convenience, not a Phase 0 blocker.

1. Enable and secure the Windows OpenSSH Server using normal Windows administration.
2. Use key-based authentication and keep hostnames, usernames, keys, and private network addresses outside the repository.
3. Add a local SSH host alias on the Mac.
4. Verify the connection with `ssh <local-alias>`.
5. Trigger validation with a remote PowerShell command that changes to the Windows local clone and runs `scripts\validate-windows.ps1 -Pull`.

Do not store credentials or machine-specific SSH configuration in this repository. If the Windows PC is offline, leave Unity validation pending rather than weakening or fabricating the acceptance result.
