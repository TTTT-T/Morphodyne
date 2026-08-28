[CmdletBinding()]
param(
    [switch]$Pull,
    [string]$UnityEditorPath
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$branch = git branch --show-current
if ($branch -ne "phase-0-foundation") {
    throw "Expected branch phase-0-foundation, found '$branch'."
}

if ($Pull) {
    git pull --ff-only origin phase-0-foundation
    if ($LASTEXITCODE -ne 0) {
        throw "git pull --ff-only failed."
    }
}

dotnet restore Morphodyne.sln --disable-parallel
if ($LASTEXITCODE -ne 0) {
    throw "dotnet restore failed."
}

dotnet test Morphodyne.sln --configuration Release --no-restore
if ($LASTEXITCODE -ne 0) {
    throw "Core tests failed."
}

if ([string]::IsNullOrWhiteSpace($UnityEditorPath)) {
    $editorRoots = @(
        "$env:ProgramFiles\Unity\Hub\Editor",
        "${env:ProgramFiles(x86)}\Unity\Hub\Editor"
    ) | Where-Object { $_ -and (Test-Path $_) }

    $UnityEditorPath = $editorRoots |
        ForEach-Object { Get-ChildItem $_ -Directory -Filter "6000.3.*" -ErrorAction SilentlyContinue } |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "Editor\Unity.exe" } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($UnityEditorPath) -or -not (Test-Path $UnityEditorPath)) {
    throw "Unity 6.3 LTS editor was not found. Run bootstrap-windows.ps1 and complete Unity Hub licensing first."
}

$logDirectory = Join-Path $repoRoot "TestResults"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$unityLog = Join-Path $logDirectory "unity-phase0-validation.log"

& $UnityEditorPath -batchmode -nographics -quit -projectPath $repoRoot -logFile $unityLog
if ($LASTEXITCODE -ne 0) {
    throw "Unity batch validation failed with exit code $LASTEXITCODE. Inspect $unityLog."
}

$errors = Select-String -Path $unityLog -Pattern "error CS[0-9]+|Compilation failed|Aborting batchmode" -CaseSensitive:$false
if ($errors) {
    $errors | Select-Object -First 20 | ForEach-Object { Write-Host $_.Line }
    throw "Unity log contains compilation or batchmode errors."
}

Write-Host "PASS: .NET tests and Unity 6.3 batch open/import/compile completed."
Write-Host "Unity log: $unityLog"
Write-Host "Manual acceptance still required: open the project through Unity Hub and confirm the Console is clean."
Write-Host "Review git status after Unity import; commit only intentional project metadata changes."
