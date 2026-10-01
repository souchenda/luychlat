#!/usr/bin/env bash
# Run by cron every 5 minutes (see enable-auto-update.sh): when GitHub has a
# newer master, deploy it with update.sh. Does nothing otherwise. A failed
# build leaves the running app untouched and is retried on the next run.
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch --quiet origin master
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" ]; then
  exit 0
fi

echo "=== $(date -Is) deploying $(git rev-parse --short origin/master)"
exec ./deploy/update.sh
