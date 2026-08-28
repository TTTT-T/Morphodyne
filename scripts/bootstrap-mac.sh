#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
install_missing=false

if [[ "${1:-}" == "--install-missing" ]]; then
  install_missing=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--install-missing]" >&2
  exit 64
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: bootstrap-mac.sh must run on macOS." >&2
  exit 1
fi

echo "Morphodyne Phase 0 Mac prerequisite audit"
echo "Repository: ${repo_root}"
df -h "${repo_root}"

missing=0
for command_name in git ssh rg; do
  if command -v "${command_name}" >/dev/null 2>&1; then
    echo "PASS: ${command_name} -> $(command -v "${command_name}")"
  else
    echo "MISSING: ${command_name}" >&2
    missing=1
  fi
done

if ! command -v dotnet >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1 && brew_prefix="$(brew --prefix dotnet@8 2>/dev/null)"; then
    export DOTNET_ROOT="${brew_prefix}/libexec"
    export PATH="${brew_prefix}/bin:${PATH}"
  elif [[ "${install_missing}" == true ]] && command -v brew >/dev/null 2>&1; then
    echo "Installing required .NET 8 LTS SDK with Homebrew..."
    brew install dotnet@8
    brew_prefix="$(brew --prefix dotnet@8)"
    export DOTNET_ROOT="${brew_prefix}/libexec"
    export PATH="${brew_prefix}/bin:${PATH}"
  else
    echo "MISSING: .NET 8 SDK" >&2
    echo "Install with: brew install dotnet@8" >&2
    echo "Or rerun this script with --install-missing." >&2
    missing=1
  fi
fi

if command -v dotnet >/dev/null 2>&1; then
  dotnet_version="$(dotnet --version)"
  if [[ "${dotnet_version}" != 8.* ]]; then
    echo "ERROR: Morphodyne Phase 0 requires .NET SDK 8.x; found ${dotnet_version}." >&2
    missing=1
  else
    echo "PASS: dotnet ${dotnet_version} -> $(command -v dotnet)"
  fi
fi

if command -v gh >/dev/null 2>&1; then
  echo "OPTIONAL: GitHub CLI -> $(command -v gh)"
else
  echo "OPTIONAL MISSING: GitHub CLI; only required to create a PR from the command line."
fi

if [[ "${missing}" -ne 0 ]]; then
  echo "Mac prerequisite audit failed." >&2
  exit 2
fi

export DOTNET_CLI_HOME="${repo_root}/.cache/dotnet-cli"
export NUGET_PACKAGES="${repo_root}/.cache/nuget"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
mkdir -p "${DOTNET_CLI_HOME}" "${NUGET_PACKAGES}"

echo "PASS: project-local removable .NET cache -> ${repo_root}/.cache"
echo "Audit complete. Run scripts/build-test-mac.sh next."
