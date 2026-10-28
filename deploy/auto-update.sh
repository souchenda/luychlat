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

# A release that changes the database waits for the quiet hours, 22:00–06:59 (deploy/deploy-window.sh — founder,
# 28/10/2026); the founder is told once that it waits. Unknown history counts as a migration (the safe side).
target=$(git rev-parse origin/master)
if [ "$deployed" != "$target" ]; then
  if changed=$(git diff --name-only "$deployed" "$target" -- supabase/migrations/ 2>/dev/null); then
    migrations=$(printf '%s' "$changed" | grep -c . || true)
  else
    migrations=1
  fi
  forced=0
  git log --format=%B "$deployed..$target" 2>/dev/null | grep -qE '^Deploy-now:' && forced=1
  hour=$(TZ=Asia/Phnom_Penh date +%-H)
  if ! sh deploy/deploy-window.sh "$hour" "$migrations" "$forced"; then
    if [ "$(cat deploy/run/.held-notified 2>/dev/null)" != "$(git rev-parse --short "$target")" ]; then
      echo "=== $(date -Is) holding $(git rev-parse --short "$target") until 22:00 ($migrations database change(s))"
      bash ./deploy/deploy-notify.sh held || true
    fi
    exit 0
  fi
fi

if [ "$env_now" != "$env_deployed" ]; then
  echo "=== $(date -Is) .env changed: redeploying"
else
  echo "=== $(date -Is) deploying $(git rev-parse --short origin/master)"
fi
exec ./deploy/update.sh
