#!/bin/bash
# Full pre-release suite as a non-root user. Invoked from
# docs/RUN_AS_VERIFIER.md so the host shell cannot expand `id` / `$PWD`
# the way PowerShell did on the one-liner.
set -euo pipefail
test "$(id -u)" != "0"
echo "uid=$(id -u) user=$(id -un)"
# /tmp/cedulon may already exist from a root-owned earlier run.
WORKDIR="${TMPDIR:-/tmp}/cedulon-suite-$$"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
cp -a /src/. .
rm -rf node_modules packages/*/node_modules examples/*/node_modules
npm ci --ignore-scripts
npm run test:pre-release
