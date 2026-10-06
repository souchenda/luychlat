#!/usr/bin/env bash
# Origin lockdown: web ports only from Cloudflare (and Telegram's webhook
# senders), so floods aimed at the Droplet's IP never reach Nginx.
#   - 80, 443 from Cloudflare's published ranges (ips-v4 / ips-v6)
#   - 443 from Telegram's webhook ranges (149.154.160.0/20, 91.108.4.0/22),
#     so the bot works even while Telegram still uses the old DNS answer
#   - removes the "Nginx Full" allow-from-anywhere rules (added rules first: no gap)
#   - SSH is never touched
# Backs up /etc/ufw first; re-runnable (existing rules are skipped). Installs a
# monthly refresh. Rollback: ufw allow 'Nginx Full'
#   bash deploy/cloudflare-firewall.sh
set -euo pipefail

command -v ufw >/dev/null || { echo "! ufw not installed"; exit 1; }
ufw status | grep -q "Status: active" || { echo "! ufw is not active: nothing changed"; exit 1; }
ufw status | grep -qE "^(OpenSSH|22)(/tcp)? .*ALLOW" || { echo "! no SSH allow rule: refusing to lock the firewall"; exit 1; }

v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
ranges=$(printf '%s\n%s\n' "$v4" "$v6" | grep -E '^[0-9a-fA-F:.]+/[0-9]{1,3}$' || true)
count=$(printf '%s\n' "$ranges" | grep -c . || true)
[ "$count" -ge 10 ] || { echo "! Cloudflare ranges look wrong ($count): nothing changed"; exit 1; }

ts=$(date +%Y%m%d-%H%M%S)
tar czf "/root/ufw-backup-$ts.tar.gz" -C /etc ufw
echo "backup: /root/ufw-backup-$ts.tar.gz"

for r in $ranges; do
  ufw allow proto tcp from "$r" to any port 80,443 comment cloudflare >/dev/null
done
for r in 149.154.160.0/20 91.108.4.0/22; do
  ufw allow proto tcp from "$r" to any port 443 comment telegram-webhook >/dev/null
done
echo "✓ allowed 80/443 from $count Cloudflare ranges, 443 from Telegram"

# Only now: drop the allow-from-anywhere web rules (IPv4 and IPv6).
ufw --force delete allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force delete allow 'Nginx HTTP' >/dev/null 2>&1 || true
ufw --force delete allow 'Nginx HTTPS' >/dev/null 2>&1 || true
ufw --force delete allow 80/tcp >/dev/null 2>&1 || true
ufw --force delete allow 443/tcp >/dev/null 2>&1 || true
ufw reload >/dev/null
echo "✓ web ports closed to everything but Cloudflare and Telegram"

cron=/etc/cron.d/cloudflare-firewall
if [ -d /etc/cron.d ] && [ ! -f "$cron" ]; then
  echo "27 4 1 * * root bash $(cd "$(dirname "$0")" && pwd)/cloudflare-firewall.sh >/dev/null 2>&1" > "$cron"
fi
