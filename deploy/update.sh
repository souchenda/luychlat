#!/usr/bin/env bash
# Pull the latest code, apply new database migrations, rebuild the container
# and wait until it is healthy. Run from the repository folder on the Droplet:
#   ./deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Pulling latest code"
git pull --ff-only

echo "→ Updating the database"
./deploy/migrate.sh

echo "→ Building and restarting the container"
docker compose up -d --build

echo "→ Waiting for the health check"
for i in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' luysmart 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "✓ luysmart is healthy"
    # Official Telegram bot: activate with the token from .env (skipped without it).
    bash ./deploy/bot-activate.sh || echo "! Bot activation failed (the app is deployed; activate it in /admin)"
    git rev-parse HEAD > deploy/.deployed
    # Lets auto-update.sh redeploy when .env changes (e.g. a new token).
    sha256sum .env 2>/dev/null | cut -d' ' -f1 > deploy/.deployed-env || true
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "✗ Container did not become healthy. Recent logs:"
docker compose logs --tail=50 app
exit 1
