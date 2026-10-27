#!/bin/sh
# luychlat.com — publishes the official website (Website/) to /var/www/luychlat-landing, on the founder's approval only
# (founder, 27/10/2026). Run on the Droplet from the repository checkout:
#
#   sudo sh deploy/landing-publish.sh            (publish)
#   sudo sh deploy/landing-publish.sh rollback   (put the previous version back)
#
# Only the site's own files are copied (never the drafts index01.html / «index_wrong data.html»); the live folder is
# kept as a dated backup first. Nginx learns, once: clean addresses (/privacy, /islamic, /delete-account), the 404
# page, and a week's cache for the images (the HTML, CSS and JS stay «no-cache», so an update shows at once).
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
SRC="$REPO/Website"
DEST=/var/www/luychlat-landing
BACKUP_ROOT=/var/www/luychlat-landing-backups
SITE_CONF=/etc/nginx/sites-enabled/luychlat.com.conf

if [ "${1:-}" = "rollback" ]; then
  last=$(ls -1d "$BACKUP_ROOT"/* 2>/dev/null | tail -1)
  [ -n "$last" ] || { echo "No backup to roll back to."; exit 1; }
  rm -rf "$DEST" && cp -a "$last" "$DEST"
  echo "✓ Rolled back to $last"
  exit 0
fi

FILES="index.html islamic.html privacy.html delete-account.html 404.html site.css site.js i18n.js
logo.png logo-islamic.png screen-business.webp screen-personal.webp og.png og-islamic.png robots.txt sitemap.xml
en/index.html zh/index.html"

for f in $FILES; do [ -f "$SRC/$f" ] || { echo "Missing $SRC/$f — nothing published."; exit 1; }; done

stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_ROOT"
[ -d "$DEST" ] && cp -a "$DEST" "$BACKUP_ROOT/$stamp" && echo "✓ Backup: $BACKUP_ROOT/$stamp"

next="$DEST.next"
rm -rf "$next" && mkdir -p "$next/en" "$next/zh"
for f in $FILES; do cp "$SRC/$f" "$next/$f"; done
chmod -R a+rX "$next"
rm -rf "$DEST.old" && { [ -d "$DEST" ] && mv "$DEST" "$DEST.old" || true; } && mv "$next" "$DEST" && rm -rf "$DEST.old"
echo "✓ Published $(echo $FILES | wc -w) files to $DEST"

if ! grep -q "luychlat-landing-v2" "$SITE_CONF"; then
  cp "$SITE_CONF" "$BACKUP_ROOT/luychlat.com.conf.$stamp"
  python3 - "$SITE_CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = """    location / {
        include snippets/luychlat-security.conf;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }"""
new = """    # luychlat-landing-v2 (27/10/2026): clean addresses, the 404 page, cached images.
    error_page 404 /404.html;
    location / {
        include snippets/luychlat-security.conf;
        try_files $uri $uri.html $uri/ =404;
        add_header Cache-Control "no-cache" always;
    }
    location ~* \\.(png|webp|svg|ico)$ {
        include snippets/luychlat-security.conf;
        try_files $uri =404;
        add_header Cache-Control "public, max-age=604800" always;
    }"""
if old not in s:
    sys.exit("luychlat.com.conf: the expected «location /» block was not found — Nginx left unchanged")
open(p, "w").write(s.replace(old, new, 1))
PY
  if nginx -t 2>/dev/null; then
    systemctl reload nginx && echo "✓ Nginx: clean addresses, 404 page, image cache"
  else
    cp "$BACKUP_ROOT/luychlat.com.conf.$stamp" "$SITE_CONF"
    echo "! Nginx test failed — the previous configuration was restored (the site files are published)."
    exit 1
  fi
fi

for path in / /en/ /zh/ /islamic /privacy /delete-account /og.png /no-such-page; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://luychlat.com$path")
  echo "  $code  https://luychlat.com$path"
done
