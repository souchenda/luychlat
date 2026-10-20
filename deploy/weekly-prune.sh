#!/usr/bin/env bash
# Weekly clean-up (founder, 20/10/2026 — each deploy leaves ~1–2 GB of build cache; 43 GB had piled up by 19/10):
# every Sunday 03:00 Cambodia time (cron, installed by update.sh): Docker's unused objects (stopped containers, unused
# networks, dangling images — NEVER volumes: the database's data), the build cache older than a week, and the system
# journal beyond 7 days. Never while a deploy or the APK build runs (it waits for neither — it skips and tries next
# week). The disk before / after and Docker's «reclaimed» lines go to /var/log/luysmart-prune.log, and one summary line
# to the deployment log.
set -u

cd "$(dirname "$0")/.."
LOG=/var/log/luysmart-prune.log
free_gb() { df -BG / | awk 'NR==2 { sub(/G$/, "", $4); print $4 }'; }

{
  echo "=== $(TZ=Asia/Phnom_Penh date -Is) weekly prune"
  if ps -eo args | grep -q "[b]uild-apk"; then
    echo "! the APK build is running: skipped"
    exit 0
  fi
  before=$(free_gb)
  # The deploy holds this lock while it migrates, builds and switches; skip rather than race it.
  if ! flock -n /tmp/luysmart-deploy.lock bash -c '
      docker system prune -f --volumes=false 2>&1 | grep -i "reclaimed" || echo "system: nothing to reclaim"
      docker builder prune -af --filter "until=168h" 2>&1 | grep -i "reclaimed" || echo "builder: nothing to reclaim"
      docker image prune -f 2>&1 | grep -i "reclaimed" || echo "images: nothing to reclaim"
      journalctl --vacuum-time=7d 2>&1 | tail -1 || true'; then
    echo "! a deploy is running: skipped"
    exit 0
  fi
  after=$(free_gb)
  echo "✓ disk free: ${before} GB → ${after} GB (+$((after - before)) GB)"
  echo "$(TZ=Asia/Phnom_Penh date -Is) weekly clean-up: disk free ${before} GB → ${after} GB (+$((after - before)) GB reclaimed)" >> /var/log/luysmart-deploy.log
} >> "$LOG" 2>&1
