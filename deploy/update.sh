#!/usr/bin/env bash
# Pull the latest code, apply new database migrations and deploy with zero
# downtime. Run from the repository folder on the Droplet:
#   ./deploy/update.sh
#
# Blue / green: the new version starts in the idle slot next to the running
# one, and Nginx is switched to it (nginx -s reload, no dropped requests) only
# once it is healthy; then the old slot stops. A failed build or health check
# leaves the running version untouched.
#   blue   project luysmart        container luysmart        port 3000
#   green  project luysmart-green  container luysmart-green  port 3001
# deploy/run/active-slot says which one Nginx points at (the app reads it too:
# only the active slot runs the bot's reminders and posts).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--pulled" ]; then
  echo "→ Pulling latest code"
  git pull --ff-only
  # Run the version of this script that was just pulled.
  exec ./deploy/update.sh --pulled
fi

echo "→ Updating the database"
./deploy/migrate.sh

echo "→ Nginx: upstream switch and maintenance page"
zero_downtime=1
sudo_cmd=""
[ "$(id -u)" -eq 0 ] || sudo_cmd="sudo"
$sudo_cmd bash ./deploy/nginx-setup.sh || zero_downtime=0

slot_project() { [ "$1" = "green" ] && echo "luysmart-green" || echo "luysmart"; }
slot_port() { [ "$1" = "green" ] && echo 3001 || echo 3000; }

active=$(cat deploy/run/active-slot 2>/dev/null || echo blue)
[ "$active" = "green" ] || active=blue
if [ "$zero_downtime" = "1" ]; then
  [ "$active" = "blue" ] && next=green || next=blue
else
  # Nginx couldn't be prepared: restart in place (a short gap) as before.
  echo "! Nginx is not set up for switching: restarting in place"
  next=$active
fi

compose() {
  local slot=$1
  shift
  COMPOSE_PROJECT_NAME=$(slot_project "$slot") CONTAINER_NAME=$(slot_project "$slot") APP_PORT=$(slot_port "$slot") APP_SLOT=$slot \
    docker compose "$@"
}

mkdir -p deploy/run
echo "→ Building $next (port $(slot_port "$next")) while $active keeps serving"
compose "$next" build
if [ "$next" != "$active" ]; then
  compose "$next" down --remove-orphans >/dev/null 2>&1 || true
fi
compose "$next" up -d

echo "→ Waiting for the health check"
container=$(slot_project "$next")
healthy=0
for i in $(seq 1 40); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ] && wget -qO- "http://127.0.0.1:$(slot_port "$next")/api/health" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 3
done
if [ "$healthy" != "1" ]; then
  echo "✗ $container did not become healthy. Recent logs:"
  compose "$next" logs --tail=50 app || true
  if [ "$next" != "$active" ]; then
    compose "$next" down >/dev/null 2>&1 || true
    echo "  $active is still serving."
  fi
  exit 1
fi
echo "✓ $container is healthy"

if [ "$next" != "$active" ]; then
  echo "→ Switching Nginx to $next"
  $sudo_cmd bash ./deploy/nginx-setup.sh --switch "$(slot_port "$next")"
  echo "$next" > deploy/run/active-slot
  # Requests already sent to the old slot get time to finish (stop_grace_period).
  sleep 5
  echo "→ Stopping $active"
  compose "$active" down --timeout 30 >/dev/null 2>&1 || true
else
  echo "$next" > deploy/run/active-slot
fi

# Official Telegram bot: activate with the token from .env (skipped without it).
COMPOSE_PROJECT_NAME=$(slot_project "$next") CONTAINER_NAME=$(slot_project "$next") APP_PORT=$(slot_port "$next") APP_SLOT=$next \
  bash ./deploy/bot-activate.sh || echo "! Bot activation failed (the app is deployed; activate it in /admin)"
git rev-parse HEAD > deploy/.deployed
# Lets auto-update.sh redeploy when .env changes (e.g. a new token).
sha256sum .env 2>/dev/null | cut -d' ' -f1 > deploy/.deployed-env || true
docker image prune -f >/dev/null
echo "✓ Deployed $(git rev-parse --short HEAD) on $next"
