#!/bin/bash
# Full pre-release suite from a Linux git checkout, not a copy of a
# Windows working tree. Bind-mounting the host repo and `cp -a` left
# spec/ with a dirty git diff (crlf-guard). Cloning the objects and
# checking them out here applies this platform's line endings.
set -euo pipefail
test "$(id -u)" != "0"
echo "uid=$(id -u) user=$(id -un)"
test -d /origin/.git
WORKDIR="${TMPDIR:-/tmp}/cedulon-native-$$"
# The bind-mounted .git is owned by the Windows host user; git on
# Linux then refuses it as "dubious ownership". safe.directory on
# the clone command is local to this process, not a host config edit.
git -c safe.directory=/origin -c safe.directory=/origin/.git \
  clone --no-hardlinks /origin "$WORKDIR"
cd "$WORKDIR"
echo "HEAD=$(git rev-parse HEAD)"
npm ci --ignore-scripts
npm run test:pre-release
