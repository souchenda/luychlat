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

# The monthly restore test (founder, 6/11/2026 — «a backup never restored is not a backup»): the archive restored into a
# throw-away Postgres container on this Droplet (never production), then checked — the public tables are there and real
# rows came back (workspaces, transactions). Supabase's own extensions and roles fail to restore in a plain Postgres and
# are ignored; only the data counts. Success → $STATUS/restore.txt only; a failure → one 🔴 message.
restore_test() {
  archive=$1
  name=luysmart-restore-test
  docker rm -f "$name" >/dev/null 2>&1
  docker run -d --name "$name" -e POSTGRES_PASSWORD=restore-test postgres:17-alpine >/dev/null 2>&1 || { echo "postgres did not start"; return 1; }
  i=0
  until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do
    i=$((i + 1)); [ $i -gt 90 ] && break; sleep 1
  done
  for role in anon authenticated service_role authenticator supabase_admin supabase_auth_admin supabase_storage_admin; do
    docker exec "$name" psql -U postgres -qc "create role $role" >/dev/null 2>&1
  done
  docker exec "$name" psql -U postgres -qc "create schema if not exists extensions" >/dev/null 2>&1
  docker exec -i "$name" pg_restore -U postgres -d postgres --no-owner --no-privileges < "$archive" > /dev/null 2> "$STATUS/restore.err"
  q() { docker exec "$name" psql -U postgres -At -c "$1" 2>/dev/null; }
  t=$(q "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")
  w=$(q "select count(*) from public.workspaces")
  x=$(q "select count(*) from public.transactions")
  docker rm -f "$name" >/dev/null 2>&1
  echo "public tables ${t:-0} · workspaces ${w:-0} · transactions ${x:-0}"
  [ "${t:-0}" -ge 80 ] && [ "${w:-0}" -gt 0 ] && [ "${x:-0}" -gt 0 ]
}

case "${1:-}" in
  install)
    if ! crontab -l 2>/dev/null | grep -q "luysmart-db-backup"; then
      (crontab -l 2>/dev/null; echo "30 2 * * * sh $REPO/deploy/db-backup.sh >/dev/null 2>&1 # luysmart-db-backup") | crontab -
    fi
    echo "✓ Nightly backup at 02:30"; exit 0 ;;
  list)
    ls -lh "$DIR" 2>/dev/null; cat "$STATUS/last.txt" 2>/dev/null; cat "$STATUS/restore.txt" 2>/dev/null; exit 0 ;;
  restore-test)
    mkdir -p "$STATUS"
    latest=$(ls -1t "$DIR"/luysmart_*.dump 2>/dev/null | head -1)
    [ -n "$latest" ] || { echo "no archive"; exit 1; }
    if result=$(restore_test "$latest"); then echo "$(date +%F) ok · $(basename "$latest") · $result" | tee "$STATUS/restore.txt"; exit 0; fi
    echo "$(date +%F) FAILED · $(basename "$latest") · $result" | tee "$STATUS/restore.txt"
    notify "🔴 បង ការសាកស្ដារ Backup ប្រចាំខែ បរាជ័យ ($result)។ Backup នៅដដែល តែត្រូវពិនិត្យថាអាចស្ដារបានពិតប្រាកដ៖ $STATUS/restore.err"
    exit 1 ;;
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

# The 1st of each month: tonight's good archive restored and checked (above).
if [ -z "$problem" ] && [ "$(date +%d)" = "01" ]; then sh "$0" restore-test >/dev/null 2>&1; fi
exit 0
