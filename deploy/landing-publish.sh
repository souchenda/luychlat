#!/bin/sh
# luychlat.com — publishes the official website (Website/) to /var/www/luychlat-landing (founder, 27/10/2026). Since
# 29/10/2026 every release that changes Website/ runs it on its own (deploy/update.sh — «without waiting for my tap»);
# the Control Center's «ផ្សាយគេហទំព័រឡើងវិញ» and a price change in Admin still run it too. On the Droplet:
#
#   sudo sh deploy/landing-publish.sh            (publish)
#   sudo sh deploy/landing-publish.sh rollback   (put the previous version back)
#
# Only the site's own files are copied (never the drafts index01.html / «index_wrong data.html»); the live folder is
# kept as a dated backup first. Nginx learns, once: clean addresses (/personal, /family, /business, /privacy, /islamic, /delete-account), the 404
# page, a Content-Security-Policy (only this site's own scripts, Google Fonts and Cloudflare's cookieless analytics) and
# a week's cache for the images (the HTML, CSS and JS stay «no-cache», so an update shows at once). It writes the
# manifest deploy/landing-watch.sh checks every 5 minutes (a changed or unknown file → a Telegram alert), installs that
# watcher once, and tells the founder in Telegram what was published.
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
SRC="$REPO/Website"
DEST=/var/www/luychlat-landing
BACKUP_ROOT=/var/www/luychlat-landing-backups
SITE_CONF=/etc/nginx/sites-enabled/luychlat.com.conf
MANIFEST_DIR=/var/lib/luychlat-landing

# The fingerprint of every published file (deploy/landing-watch.sh compares the live folder with it).
write_manifest() {
  mkdir -p "$MANIFEST_DIR"
  (cd "$DEST" && find . -type f | sed 's|^\./||' | sort > "$MANIFEST_DIR/files.txt" \
    && xargs -d '\n' sha256sum < "$MANIFEST_DIR/files.txt" > "$MANIFEST_DIR/manifest.sha256")
}

# One line to the founder — the watcher's route (DEVOPS_CHAT_ID, else the super admins' linked chats).
notify() {
  sh "$REPO/deploy/landing-watch.sh" notify "$1" || true
}

if [ "${1:-}" = "rollback" ]; then
  last=$(ls -1d "$BACKUP_ROOT"/2* 2>/dev/null | tail -1)
  [ -n "$last" ] || { echo "No backup to roll back to."; exit 1; }
  rm -rf "$DEST" && cp -a "$last" "$DEST"
  write_manifest
  echo "✓ Rolled back to $last"
  notify "↩️ គេហទំព័រ luychlat.com ត្រូវបានត្រឡប់ទៅកំណែមុន ($(basename "$last"))។"
  exit 0
fi

FILES="index.html personal.html family.html business.html islamic.html privacy.html delete-account.html 404.html site.css site.js i18n.js islamic-t.js privacy-t.js
delete-t.js business-t.js personal-t.js family-t.js logo.png logo-islamic.png screen-business.webp screen-personal.webp og.png og-islamic.png robots.txt sitemap.xml
en/index.html zh/index.html"

for f in $FILES; do [ -f "$SRC/$f" ] || { echo "Missing $SRC/$f — nothing published."; exit 1; }; done

stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_ROOT"
[ -d "$DEST" ] && cp -a "$DEST" "$BACKUP_ROOT/$stamp" && echo "✓ Backup: $BACKUP_ROOT/$stamp"

next="$DEST.next"
rm -rf "$next" && mkdir -p "$next/en" "$next/zh"
for f in $FILES; do cp "$SRC/$f" "$next/$f"; done
# Every page asks for its styles, scripts and pictures by content version («site.css?v=1a2b3c4d»): Cloudflare and the
# browsers keep them for hours or days, so a new page must never meet yesterday's CSS or screenshot (founder, 28/10/2026
# — the new footer drawn with the old styles). A file that did not change keeps its address and its cache.
version_assets() {
  for a in site.css site.js i18n.js islamic-t.js privacy-t.js delete-t.js business-t.js personal-t.js family-t.js screen-business.webp screen-personal.webp logo.png logo-islamic.png og.png og-islamic.png; do
    v=$(sha256sum "$1/$a" | cut -c1-8)
    re=$(printf '%s' "$a" | sed 's/\./\\./g')
    for page in "$1"/*.html "$1"/en/index.html "$1"/zh/index.html; do
      sed -i "s#\([\"/]\)$re\"#\1$a?v=$v\"#g" "$page"
    done
  done
}
# The prices from the app's own plans (deploy/site-prices.py — founder, 28/10/2026); a failure keeps the page's own.
python3 "$REPO/deploy/site-prices.py" "$next" || true
version_assets "$next"
chmod -R a+rX "$next"
rm -rf "$DEST.old" && { [ -d "$DEST" ] && mv "$DEST" "$DEST.old" || true; } && mv "$next" "$DEST" && rm -rf "$DEST.old"
write_manifest
echo "✓ Published $(echo $FILES | wc -w) files to $DEST (manifest in $MANIFEST_DIR)"

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
csp = ("default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
       "img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'; upgrade-insecure-requests")
new = """    # luychlat-landing-v2 (27/10/2026): clean addresses, the 404 page, the CSP, cached images.
    error_page 404 /404.html;
    location / {
        include snippets/luychlat-security.conf;
        add_header Content-Security-Policy "CSP" always;
        try_files $uri $uri.html $uri/ =404;
        add_header Cache-Control "no-cache" always;
    }
    location ~* \\.(png|webp|svg|ico)$ {
        include snippets/luychlat-security.conf;
        try_files $uri =404;
        add_header Cache-Control "public, max-age=604800" always;
    }""".replace("CSP", csp)
if old not in s:
    sys.exit("luychlat.com.conf: the expected «location /» block was not found — Nginx left unchanged")
open(p, "w").write(s.replace(old, new, 1))
PY
  if nginx -t 2>/dev/null; then
    systemctl reload nginx && echo "✓ Nginx: clean addresses, 404 page, CSP, image cache"
  else
    cp "$BACKUP_ROOT/luychlat.com.conf.$stamp" "$SITE_CONF"
    echo "! Nginx test failed — the previous configuration was restored (the site files are published)."
    exit 1
  fi
fi

# The watcher, once (every 5 minutes).
if ! crontab -l 2>/dev/null | grep -q "luychlat-landing-watch"; then
  (crontab -l 2>/dev/null; echo "*/5 * * * * sh $REPO/deploy/landing-watch.sh >/dev/null 2>&1 # luychlat-landing-watch") | crontab -
  echo "✓ Watcher installed (every 5 minutes)"
fi

# Every page checked live first, then the founder is told what is new and whether it all opens (founder, 29/10/2026 —
# «just tell me in Telegram that it was published, and what changed»). WEBSITE_CHANGES: the releases' Khmer lines.
pages=0; broken=""
for path in / /en/ /zh/ /personal /family /business /islamic /privacy /delete-account /og.png; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://luychlat.com$path")
  echo "  $code  https://luychlat.com$path"
  if [ "$code" = "200" ]; then pages=$((pages + 1)); else broken="$broken $path"; fi
done
code=$(curl -s -o /dev/null -w "%{http_code}" "https://luychlat.com/no-such-page"); echo "  $code  https://luychlat.com/no-such-page"
msg="🌐 គេហទំព័រ luychlat.com បានផ្សាយកំណែថ្មីហើយ ✅"
if [ -n "${WEBSITE_CHANGES:-}" ]; then
  msg="$msg

អ្វីដែលថ្មី៖
$(printf '%s\n' "$WEBSITE_CHANGES" | sed 's/^/• /')"
fi
if [ -z "$broken" ]; then
  msg="$msg

ទំព័រទាំង $pages បើកបានធម្មតា។"
else
  msg="$msg

⚠️ ទំព័របើកមិនបាន៖$broken — កំណែមុនត្រូវបានរក្សាទុក (rollback)។"
fi
notify "$msg"
