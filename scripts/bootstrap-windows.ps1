$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
Write-Host 'Morphodyne Phase 0 bootstrap (Windows, optional)'
Get-PSDrive -Name (Get-Location).Drive.Name | Select-Object Name, Free, Used
foreach ($tool in @('git', 'node', 'npm')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing $tool. Install it and rerun." }
}
git --version
node --version
npm --version
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 22 && minor >= 12) || major === 24 || major >= 26)) process.exit(1)'
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12+, 24.x or 26+ is required.' }
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Host 'Bootstrap complete. Run npm run dev for the browser smoke scene.'
