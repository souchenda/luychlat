#!/bin/sh
# The app's database backed up every night to this Droplet (founder, 27/10/2026 — «prevention is better than cure»):
# the Supabase data (public, auth, storage schemas) as a pg_dump custom archive in /var/backups/luysmart (root only),
# kept 30 days. Each archive is checked (pg_restore can list it, enough tables, not much smaller than the last); a
# failure or a suspicious archive → one Telegram message. deploy/landing-watch.sh also says if no good backup is ≤ 26 h
# old (a cron that stopped). The photos in Supabase Storage are not in it (files, not rows) — a later step.
#
#   sudo sh deploy/db-backup.sh            (one backup now)
#   sudo sh deploy/db-backup.sh install    (the nightly cron, 02:30 Cambodia time)
#   sudo sh deploy/db-backup.sh list       (the archives)
#
# Restore (never on production without a decision): pg_restore --no-owner -d <a new database URL> <archive>
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
APP_DIR=${APP_DIR:-/opt/luysmart}
DIR=${BACKUP_DIR:-/var/backups/luysmart}
STATUS=/var/lib/luysmart-backup
KEEP_DAYS=30
MIN_TABLES=100

notify() { sh "$REPO/deploy/landing-watch.sh" notify "$1" || true; }

case "${1:-}" in
  install)
    if ! crontab -l 2>/dev/null | grep -q "luysmart-db-backup"; then
      (crontab -l 2>/dev/null; echo "30 2 * * * sh $REPO/deploy/db-backup.sh >/dev/null 2>&1 # luysmart-db-backup") | crontab -
    fi
    echo "✓ Nightly backup at 02:30"; exit 0 ;;
  list)
    ls -lh "$DIR" 2>/dev/null; cat "$STATUS/last.txt" 2>/dev/null; exit 0 ;;
esac

umask 077
mkdir -p "$DIR" "$STATUS"
chmod 700 "$DIR"
url=$(grep -E "^DATABASE_URL=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
[ -n "$url" ] || { notify "🔴 Backup ទិន្នន័យអេប មិនបានធ្វើ៖ រក DATABASE_URL មិនឃើញ។"; exit 1; }

stamp=$(date +%Y%m%d-%H%M)
file="$DIR/luysmart_$stamp.dump"
if ! docker run --rm -e DATABASE_URL="$url" postgres:17-alpine sh -c \
    'pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=storage' \
    > "$file" 2> "$STATUS/last.err"; then
  rm -f "$file"
  notify "🔴 Backup ទិន្នន័យអេប បរាជ័យយប់នេះ ($stamp)។ Backup ចាស់ៗនៅដដែល។ សូមពិនិត្យ៖ $STATUS/last.err"
  exit 1
fi

tables=$(docker run --rm -i postgres:17-alpine pg_restore --list < "$file" 2>/dev/null | grep -c "TABLE DATA" || true)
size=$(stat -c %s "$file")
prev=$(cat "$STATUS/last-size" 2>/dev/null || echo 0)
problem=""
[ "${tables:-0}" -ge "$MIN_TABLES" ] || problem="មានតែ ${tables:-0} តារាង (ត្រូវយ៉ាងតិច $MIN_TABLES)"
[ "$prev" -gt 0 ] && [ $((size * 2)) -lt "$prev" ] && problem="${problem:+$problem · }តូចជាងយប់មុនពាក់កណ្ដាល ($size < $prev bytes)"
if [ -n "$problem" ]; then
  notify "⚠️ Backup ទិន្នន័យអេប យប់នេះគួរឱ្យសង្ស័យ៖ $problem។ ឯកសារត្រូវបានរក្សាទុក ($file) — សូមពិនិត្យថាទិន្នន័យមិនបាត់។"
else
  echo "$size" > "$STATUS/last-size"
  date +%s > "$STATUS/last-ok"
fi
printf '%s  %s bytes  %s tables  %s\n' "$stamp" "$size" "${tables:-0}" "${problem:-ok}" > "$STATUS/last.txt"

find "$DIR" -name 'luysmart_*.dump' -type f -mtime +$KEEP_DAYS -delete
exit 0
