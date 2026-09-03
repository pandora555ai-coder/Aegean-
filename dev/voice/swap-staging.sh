#!/usr/bin/env bash
# Task 148 - moves a verified staging batch into client/public/voice (the
# symlink into production - see CLAUDE.md's Voice section). Never run by
# agents. Refuses unless staging holds exactly EXPECTED_COUNT mp3s, so a
# partial or failed generation run can't overwrite live audio.
#
#   bash dev/voice/swap-staging.sh
#
# Override the staging dir or expected count for a smaller/partial swap:
#   STAGING_DIR=client/public/voice-staging EXPECTED_COUNT=254 bash dev/voice/swap-staging.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGING_DIR="${STAGING_DIR:-$ROOT/client/public/voice-staging}"
LIVE_DIR="${LIVE_DIR:-$ROOT/client/public/voice}"
EXPECTED_COUNT="${EXPECTED_COUNT:-254}"

if [ ! -d "$STAGING_DIR" ]; then
  echo "Refusing: staging dir not found: $STAGING_DIR" >&2
  exit 1
fi

COUNT=$(find "$STAGING_DIR" -maxdepth 1 -name '*.mp3' -type f | wc -l | tr -d ' ')

if [ "$COUNT" -ne "$EXPECTED_COUNT" ]; then
  echo "Refusing: $STAGING_DIR has $COUNT mp3 file(s), expected exactly $EXPECTED_COUNT." >&2
  echo "Nothing was copied into $LIVE_DIR." >&2
  exit 1
fi

cp "$STAGING_DIR"/*.mp3 "$LIVE_DIR"/
echo "Swapped $COUNT file(s) from $STAGING_DIR into $LIVE_DIR."
