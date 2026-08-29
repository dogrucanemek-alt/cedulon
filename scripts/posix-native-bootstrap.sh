#!/bin/bash
# Root half of the native Linux clone. Installs git, then drops to
# uid 1000 (the `node` user on node:22-bookworm). Invoked from
# docs/RUN_AS_VERIFIER.md so the host shell cannot expand `id`.
set -euo pipefail
test "$(id -u)" = "0"
apt-get update -qq
apt-get install -y -qq git
# Bind-mounted .git is owned by the Windows host uid. This config lives
# in the container only (ephemeral image layer), not on the host.
git config --system --add safe.directory /origin
git config --system --add safe.directory /origin/.git
git config --system --add safe.directory "*"
runuser -u node -- bash /origin/scripts/posix-native-clone.sh
