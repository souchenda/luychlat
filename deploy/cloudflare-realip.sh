#!/usr/bin/env bash
# Behind Cloudflare's proxy every request comes from a Cloudflare address. This
# tells Nginx to trust Cloudflare's published ranges and use the visitor's IP
# from CF-Connecting-IP instead — so per-IP rate limits, logs and the security
# stats see real visitors (a request from anywhere else can't fake the header).
#
# Writes /etc/nginx/conf.d/01-cloudflare-realip.conf from
# https://www.cloudflare.com/ips-v4 and /ips-v6, tests the config and reloads.
# On any failure the previous file stays. Installs a monthly cron to refresh.
#   bash deploy/cloudflare-realip.sh
set -euo pipefail

CONF=/etc/nginx/conf.d/01-cloudflare-realip.conf
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
# Sanity: CIDRs only, and a plausible number of them.
ranges=$(printf '%s\n%s\n' "$v4" "$v6" | grep -E '^[0-9a-fA-F:.]+/[0-9]{1,3}$' || true)
count=$(printf '%s\n' "$ranges" | grep -c . || true)
if [ "$count" -lt 10 ]; then
  echo "! Cloudflare ranges look wrong ($count): keeping the current config"
  exit 1
fi

{
  echo "# Cloudflare proxy → real visitor IP (deploy/cloudflare-realip.sh, $(date -u +%Y-%m-%d))."
  printf '%s\n' "$ranges" | sed 's/^/set_real_ip_from /; s/$/;/'
  echo "real_ip_header CF-Connecting-IP;"
} > "$tmp"

backup=""
[ -f "$CONF" ] && { backup=$(mktemp); cp "$CONF" "$backup"; }
cp "$tmp" "$CONF"
if ! nginx -t >/dev/null 2>&1; then
  echo "! nginx -t failed: restoring the previous config"
  if [ -n "$backup" ]; then cp "$backup" "$CONF"; else rm -f "$CONF"; fi
  exit 1
fi
systemctl reload nginx
[ -n "$backup" ] && rm -f "$backup"
echo "✓ Cloudflare real-IP: $count ranges"

# Refresh monthly (Cloudflare rarely changes them).
cron=/etc/cron.d/cloudflare-realip
if [ -d /etc/cron.d ] && [ ! -f "$cron" ]; then
  echo "17 4 1 * * root bash $(cd "$(dirname "$0")" && pwd)/cloudflare-realip.sh >/dev/null 2>&1" > "$cron"
fi
