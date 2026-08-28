#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
skip_restore=false

if [[ "${1:-}" == "--no-restore" ]]; then
  skip_restore=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--no-restore]" >&2
  exit 64
fi

if ! command -v dotnet >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1 && brew_prefix="$(brew --prefix dotnet@8 2>/dev/null)"; then
    export DOTNET_ROOT="${brew_prefix}/libexec"
    export PATH="${brew_prefix}/bin:${PATH}"
  else
    echo "ERROR: .NET 8 SDK is unavailable. Run scripts/bootstrap-mac.sh first." >&2
    exit 2
  fi
fi

export DOTNET_CLI_HOME="${repo_root}/.cache/dotnet-cli"
export NUGET_PACKAGES="${repo_root}/.cache/nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
export DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER=1
export MSBUILDDISABLENODEREUSE=1
mkdir -p "${DOTNET_CLI_HOME}" "${NUGET_PACKAGES}"

cd "${repo_root}"

if [[ "${skip_restore}" == false ]]; then
  dotnet restore Morphodyne.sln --disable-parallel
fi

dotnet build Morphodyne.sln \
  --configuration Release \
  --no-restore \
  --disable-build-servers \
  --maxcpucount:1 \
  -p:UseSharedCompilation=false

dotnet test Morphodyne.sln \
  --configuration Release \
  --no-restore \
  --no-build \
  --disable-build-servers \
  --maxcpucount:1 \
  -p:UseSharedCompilation=false \
  --logger "console;verbosity=minimal"

"${script_dir}/validate-architecture.sh"
