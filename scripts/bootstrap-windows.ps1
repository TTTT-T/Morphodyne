[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$missing = New-Object System.Collections.Generic.List[string]

Write-Host "Morphodyne Phase 0 Windows prerequisite audit"
Write-Host "Repository: $repoRoot"

$driveName = [System.IO.Path]::GetPathRoot($repoRoot).Substring(0, 1)
$drive = Get-PSDrive -Name $driveName
Write-Host ("Disk free: {0:N1} GiB of {1:N1} GiB" -f ($drive.Free / 1GB), (($drive.Used + $drive.Free) / 1GB))

foreach ($commandName in @("git", "ssh", "dotnet")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        Write-Host "MISSING: $commandName" -ForegroundColor Red
        $missing.Add($commandName)
    } else {
        Write-Host "PASS: $commandName -> $($command.Source)"
    }
}

if (Get-Command dotnet -ErrorAction SilentlyContinue) {
    $dotnetVersion = dotnet --version
    if (-not $dotnetVersion.StartsWith("8.")) {
        Write-Host "MISSING: .NET SDK 8.x (found $dotnetVersion)" -ForegroundColor Red
        $missing.Add(".NET SDK 8.x")
    } else {
        Write-Host "PASS: dotnet $dotnetVersion"
    }
}

$unityCandidates = @()
$editorRoots = @(
    "$env:ProgramFiles\Unity\Hub\Editor",
    "${env:ProgramFiles(x86)}\Unity\Hub\Editor"
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($editorRoot in $editorRoots) {
    $unityCandidates += Get-ChildItem $editorRoot -Directory -Filter "6000.3.*" -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName "Editor\Unity.exe" } |
        Where-Object { Test-Path $_ }
}

$unityEditor = $unityCandidates | Sort-Object -Descending | Select-Object -First 1
if ($null -eq $unityEditor) {
    Write-Host "MISSING: Unity 6.3 LTS editor" -ForegroundColor Yellow
    Write-Host "Install an approved Unity 6.3 LTS patch through Unity Hub; licensing is a manual step."
    $missing.Add("Unity 6.3 LTS editor")
} else {
    Write-Host "PASS: Unity editor -> $unityEditor"
}

if ($missing.Count -gt 0) {
    Write-Host "Windows prerequisite audit incomplete: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "Do not lower validation requirements. Install/activate prerequisites, then rerun this script."
    exit 2
}

Write-Host "Windows prerequisite audit complete. Run scripts\validate-windows.ps1 next."
