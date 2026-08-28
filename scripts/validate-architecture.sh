#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
core_dir="${repo_root}/Assets/Morphodyne/Core"
source_dir="${repo_root}/Assets/Morphodyne"

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) is required for the architecture source checks." >&2
  exit 2
fi

failed=0

if rg -n -i 'UnityEngine|MonoBehaviour|GameObject|Transform' "${core_dir}"; then
  echo "FAIL: Core contains a Unity runtime dependency." >&2
  failed=1
else
  echo "PASS: Core contains no Unity runtime symbols."
fi

if rg -n -i '\b(canWalk|canFly|canBite|moveSpeed|attackPower|biteDamage)\b' "${source_dir}"; then
  echo "FAIL: a forbidden predefined capability field is present." >&2
  failed=1
else
  echo "PASS: forbidden predefined capability fields are absent."
fi

if rg -n '<ProjectReference|<PackageReference' "${repo_root}/dotnet/Morphodyne.Core/Morphodyne.Core.csproj"; then
  echo "FAIL: the .NET Core project declares an external project or package dependency." >&2
  failed=1
else
  echo "PASS: the .NET Core project has no project or package dependencies."
fi

if ! rg -q '"noEngineReferences": true' "${core_dir}/Morphodyne.Core.asmdef"; then
  echo "FAIL: the Unity Core assembly does not prohibit engine references." >&2
  failed=1
else
  echo "PASS: the Unity Core assembly prohibits engine references."
fi

missing_meta=0
while IFS= read -r -d '' asset_path; do
  if [[ ! -f "${asset_path}.meta" ]]; then
    echo "FAIL: missing Unity metadata for ${asset_path#"${repo_root}/"}." >&2
    missing_meta=1
  fi
done < <(find "${repo_root}/Assets" -mindepth 1 ! -name '*.meta' -print0)

if [[ "${missing_meta}" -ne 0 ]]; then
  failed=1
else
  echo "PASS: every tracked Unity asset and folder has a metadata file."
fi

if [[ "${failed}" -ne 0 ]]; then
  exit 1
fi
