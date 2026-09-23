#!/usr/bin/env bash
set -euo pipefail

echo "Morphodyne Phase 0 bootstrap (macOS)"
echo
df -h /
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
echo
echo "Installing project-local dependencies..."
npm install
echo
echo "Running tests, typecheck, and build..."
npm run test
npm run typecheck
npm run build
echo
echo "Bootstrap complete. Start the local scene with: npm run dev"
