#!/usr/bin/env bash
# Run by cron every 5 minutes (see enable-auto-update.sh): when GitHub has a
# newer master, deploy it with update.sh. Does nothing otherwise. A failed
# migration or build leaves the running app untouched and is retried on the
# next run (deploy/.deployed only moves once a version is up and healthy).
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch --quiet origin master
deployed=$(cat deploy/.deployed 2>/dev/null || git rev-parse HEAD)
if [ "$deployed" = "$(git rev-parse origin/master)" ]; then
  exit 0
fi

echo "=== $(date -Is) deploying $(git rev-parse --short origin/master)"
exec ./deploy/update.sh
