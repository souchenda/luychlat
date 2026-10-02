#!/usr/bin/env bash
# Run by cron every 5 minutes (see enable-auto-update.sh): when GitHub has a
# newer master, or .env was edited, deploy with update.sh. Does nothing otherwise. A failed
# migration or build leaves the running app untouched and is retried on the
# next run (deploy/.deployed only moves once a version is up and healthy).
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch --quiet origin master
deployed=$(cat deploy/.deployed 2>/dev/null || git rev-parse HEAD)
# .env edited since the last deploy (e.g. TELEGRAM_BOT_TOKEN or DATABASE_URL added)?
env_now=$(sha256sum .env 2>/dev/null | cut -d' ' -f1 || true)
# No record yet (first run after this check was added) counts as changed: one extra deploy.
env_deployed=$(cat deploy/.deployed-env 2>/dev/null || echo "none")
if [ "$deployed" = "$(git rev-parse origin/master)" ] && [ "$env_now" = "$env_deployed" ]; then
  exit 0
fi

if [ "$env_now" != "$env_deployed" ]; then
  echo "=== $(date -Is) .env changed: redeploying"
else
  echo "=== $(date -Is) deploying $(git rev-parse --short origin/master)"
fi
exec ./deploy/update.sh
