#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
echo "Morphodyne Phase 0 bootstrap (macOS)"
echo
df -h .
echo

if ! command -v git >/dev/null 2>&1; then
  echo "Missing Git. Install Apple's Command Line Tools or Git, then rerun."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Missing Node.js. Install Node.js, then rerun."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Missing npm."
  exit 1
fi

echo "git:  $(git --version)"
echo "node: $(node --version)"
echo "npm:  $(npm --version)"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 22 && minor >= 12) || major === 24 || major >= 26)) { console.error("Node.js 22.12+, 24.x or 26+ is required by the pinned toolchain."); process.exit(1); }'
echo
echo "Project dependencies are local (node_modules); free space and footprint:"
du -sh node_modules 2>/dev/null || true
echo "Installing from package-lock.json..."
npm ci --no-audit --no-fund
echo
echo "Running tests, typecheck, and build..."
npm run test
npm run typecheck
npm run build
echo
echo "Bootstrap complete. Start the local scene with: npm run dev"
