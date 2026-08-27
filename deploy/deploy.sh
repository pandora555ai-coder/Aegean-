#!/bin/bash
set -e

DEV_DIR=~/Aegean-
PROD_DIR=/opt/party-game

cd "$DEV_DIR"

if [ -n "$(git status --porcelain)" ]; then
  echo "DEPLOY ABORTED: $DEV_DIR has uncommitted changes - commit or stash before deploying." >&2
  git status --short >&2
  exit 1
fi

if ! git pull --ff-only; then
  echo "DEPLOY ABORTED: git pull failed in $DEV_DIR - resolve manually before deploying." >&2
  exit 1
fi

sudo systemctl stop party-game

# .git: prod must never be a git working copy. client/public/voice(-test):
# the 471-file voice bank lives ONLY in prod (dev symlinks to it) and
# voice-test is dev-only scratch - neither should be touched by deploy.
sudo rsync -a \
  --exclude='.git' \
  --exclude='client/public/voice' \
  --exclude='client/public/voice-test' \
  "$DEV_DIR/" "$PROD_DIR/"

cd "$PROD_DIR"
sudo npm run build
sudo chown -R partygame:partygame "$PROD_DIR"
sudo systemctl start party-game
sleep 2
sudo systemctl is-active party-game
