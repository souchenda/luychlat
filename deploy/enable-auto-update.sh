#!/usr/bin/env bash
# One-time: make the Droplet deploy new versions from GitHub by itself.
#   cd /opt/luysmart && git pull && ./deploy/enable-auto-update.sh
# Checks every 5 minutes; log: /var/log/luysmart-deploy.log
# Turn off again:  crontab -l | grep -v luysmart-auto-update | crontab -
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$dir/deploy/auto-update.sh" "$dir/deploy/update.sh"

job="*/5 * * * * flock -n /tmp/luysmart-deploy.lock $dir/deploy/auto-update.sh >> /var/log/luysmart-deploy.log 2>&1 # luysmart-auto-update"
# Replace any earlier version of the job, keep everything else in the crontab.
{ crontab -l 2>/dev/null | grep -v 'luysmart-auto-update' || true; echo "$job"; } | crontab -

echo "✓ Auto-update is on: the app updates itself within 5 minutes of each push."
echo "  Log: tail -f /var/log/luysmart-deploy.log"
