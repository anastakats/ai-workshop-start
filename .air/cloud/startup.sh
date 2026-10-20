#!/usr/bin/env bash
# Air cloud startup for Skill Atlas: a Node (>=24) TypeScript CLI, no server to run.
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

cd "$(dirname "$0")/../.."

# Mirrors CI (.github/workflows/ci.yml): typecheck, tests and the CLI smoke on the fixture.
healthcheck() {
  echo "[healthcheck] typecheck"
  npm run typecheck
  echo "[healthcheck] tests"
  npm test
  echo "[healthcheck] CLI smoke"
  ./skill-atlas help
  ./skill-atlas scan ./fixture
  echo "[healthcheck] OK"
}

echo "[startup] node $(node -v), npm $(npm -v)"
node -e 'process.exit(parseInt(process.versions.node) >= 24 ? 0 : 1)' \
  || { echo "[startup] Node >= 24 is required (package.json engines)" >&2; exit 1; }

chmod +x ./skill-atlas

echo "[startup] npm ci"
npm ci --no-audit --no-fund
echo "[startup] dependencies installed"

if [ -n "${WARMUP:-}" ]; then healthcheck; fi
echo "[startup] done"
