#!/usr/bin/env bash
# Weekly Docker clean-up (founder, 20/10/2026 — each deploy leaves ~1–2 GB of build cache; 43 GB had piled up by 19/10):
# every Sunday 02:00 Cambodia time (cron, installed by update.sh): the build cache older than a week and the dangling
# images. Never while a deploy or the APK build runs (it waits for neither — it skips and tries next week). The disk
# before / after and Docker's «reclaimed» lines go to /var/log/luysmart-prune.log.
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
      docker builder prune -af --filter "until=168h" 2>&1 | grep -i "reclaimed" || echo "builder: nothing to reclaim"
      docker image prune -f 2>&1 | grep -i "reclaimed" || echo "images: nothing to reclaim"'; then
    echo "! a deploy is running: skipped"
    exit 0
  fi
  after=$(free_gb)
  echo "✓ disk free: ${before} GB → ${after} GB (+$((after - before)) GB)"
} >> "$LOG" 2>&1
