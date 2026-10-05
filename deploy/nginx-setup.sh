#!/usr/bin/env bash
# Nginx side of zero-downtime deploys (run as root by deploy/update.sh; safe to re-run):
#
#   ./deploy/nginx-setup.sh              prepare (idempotent):
#       - the upstream lives in /etc/nginx/snippets/luysmart-upstream.conf, so a
#         deploy can point it at the new container and reload (nginx -s reload
#         finishes requests in flight: no gap, no 502);
#       - the branded maintenance page (deploy/nginx/maintenance.html) is
#         installed and served for 502 / 503 / 504 if the app is ever down.
#   ./deploy/nginx-setup.sh --switch N   point the upstream at 127.0.0.1:N and reload.
#
# Only LuyChlat's own site file (the one using "luysmart_app") is edited, with a
# backup in /root; every change is checked with nginx -t and rolled back if it fails.
set -euo pipefail

cd "$(dirname "$0")/.."

SNIPPET=/etc/nginx/snippets/luysmart-upstream.conf
PAGE_DIR=/var/www/luysmart-maintenance

write_upstream() {
  cat > "$SNIPPET.tmp" <<EOF
# Managed by /opt/luysmart/deploy/nginx-setup.sh: the active blue / green slot.
upstream luysmart_app {
    server 127.0.0.1:$1;
    keepalive 16;
}
EOF
  mv "$SNIPPET.tmp" "$SNIPPET"
}

reload_or_restore() {
  # $1: file to restore on failure, $2: its backup
  if nginx -t >/dev/null 2>&1; then
    nginx -s reload
  else
    echo "✗ nginx -t failed: restoring $1" >&2
    nginx -t >&2 || true
    cp "$2" "$1"
    nginx -t >/dev/null 2>&1 && nginx -s reload || true
    exit 1
  fi
}

if [ "${1:-}" = "--switch" ]; then
  port=${2:?port}
  [ -f "$SNIPPET" ] || { echo "✗ $SNIPPET missing: run deploy/nginx-setup.sh first" >&2; exit 1; }
  cp "$SNIPPET" "$SNIPPET.bak"
  write_upstream "$port"
  reload_or_restore "$SNIPPET" "$SNIPPET.bak"
  echo "✓ Nginx now sends LuyChlat traffic to 127.0.0.1:$port"
  exit 0
fi

# 1. The maintenance page (refreshed on every deploy).
mkdir -p "$PAGE_DIR"
install -m 0644 deploy/nginx/maintenance.html "$PAGE_DIR/maintenance.html"

# 2. Our site file.
mapfile -t sites < <(grep -l "luysmart_app" /etc/nginx/sites-enabled/* 2>/dev/null || true)
if [ "${#sites[@]}" -ne 1 ]; then
  echo "✗ Expected one Nginx site using luysmart_app, found ${#sites[@]}" >&2
  exit 1
fi
site=$(readlink -f "${sites[0]}")

# 3. The upstream snippet (pointing at the slot that is serving now).
if [ ! -f "$SNIPPET" ]; then
  active=$(cat deploy/run/active-slot 2>/dev/null || echo blue)
  [ "$active" = "green" ] && port=3001 || port=3000
  write_upstream "$port"
fi

# 4. Patch the site once: upstream → include, maintenance page for 502 / 503 / 504,
#    and /LuyChlat.apk (the Android app, from /var/www/luysmart-downloads).
if grep -q "luysmart-upstream.conf" "$site" && grep -q "luysmart-maintenance" "$site" && grep -q "proxy_buffer_size" "$site" && grep -q "luysmart-downloads" "$site"; then
  nginx -t >/dev/null 2>&1 && nginx -s reload
  echo "✓ Nginx already set up ($site)"
  exit 0
fi
backup="/root/luysmart-nginx-$(date +%Y%m%d-%H%M%S).conf"
cp "$site" "$backup"
python3 - "$site" <<'PY'
import re, sys
path = sys.argv[1]
s = open(path, encoding="utf-8").read()
if "luysmart-upstream.conf" not in s:
    s, n = re.subn(r"upstream luysmart_app \{[^}]*\}", "# The upstream (active blue / green slot) is managed by /opt/luysmart/deploy/nginx-setup.sh.\ninclude /etc/nginx/snippets/luysmart-upstream.conf;", s, count=1)
    if n != 1:
        sys.exit("upstream block not found")
if "proxy_buffer_size" not in s:
    # Signed-in responses carry large Supabase auth cookies (Set-Cookie): with the
    # default 4–8k header buffer Nginx answers "upstream sent too big header" → 502.
    buffers = """    # Signed-in responses carry large Supabase auth cookies (Set-Cookie): the
    # default 4–8k header buffer turns them into "upstream sent too big header" 502s.
    proxy_buffer_size 64k;
    proxy_buffers 8 64k;
    proxy_busy_buffers_size 128k;

"""
    m = re.search(r"^[ \t]*(# Fingerprinted build assets[^\n]*\n[ \t]*)?location /_next/static/", s, re.M)
    if not m:
        sys.exit("app locations not found")
    s = s[: m.start()] + buffers + s[m.start():]
if "luysmart-maintenance" not in s:
    block = """    # While the app restarts or is down: LuyChlat's own page instead of Nginx's 502.
    error_page 502 503 504 /maintenance.html;
    location = /maintenance.html {
        root /var/www/luysmart-maintenance;
        internal;
        add_header Cache-Control "no-store" always;
    }

"""
    # Inside the HTTPS server block: just before its first app location.
    m = re.search(r"^[ \t]*(# Fingerprinted build assets[^\n]*\n[ \t]*)?location /_next/static/", s, re.M)
    if not m:
        sys.exit("app locations not found")
    s = s[: m.start()] + block + s[m.start():]
if "luysmart-downloads" not in s:
    block = """    # The Android app for testers (built on this server by deploy/build-apk.sh).
    location = /LuyChlat.apk {
        root /var/www/luysmart-downloads;
        try_files /LuyChlat.apk =404;
        types { }
        default_type application/vnd.android.package-archive;
        add_header Content-Disposition 'attachment; filename="LuyChlat.apk"' always;
        add_header Cache-Control "no-cache" always;
    }

"""
    m = re.search(r"^[ \t]*(# Fingerprinted build assets[^\n]*\n[ \t]*)?location /_next/static/", s, re.M)
    if not m:
        sys.exit("app locations not found")
    s = s[: m.start()] + block + s[m.start():]
open(path, "w", encoding="utf-8").write(s)
PY
reload_or_restore "$site" "$backup"
echo "✓ Nginx set up for zero-downtime deploys ($site; backup $backup)"
