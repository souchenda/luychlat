#!/usr/bin/env bash
# Apply new database migrations (supabase/migrations/*.sql) to Supabase.
# Run by update.sh before the app is rebuilt; safe to run by hand any time:
#   ./deploy/migrate.sh
#
# Each file runs once, in order, in its own transaction, and is then recorded
# in supabase_migrations.schema_migrations (the table the Supabase CLI uses).
# A failing file is rolled back and stops the deploy, so the new app version
# never starts against a half-updated database.
#
# Needs DATABASE_URL in .env (Supabase › Connect › Session pooler, port 5432).
# It stays on the Droplet: never in git, NEXT_PUBLIC_* or the app container.
# Without it, migrations are skipped and the deploy carries on as before.
set -euo pipefail

cd "$(dirname "$0")/.."

url="${DATABASE_URL:-}"
if [ -z "$url" ] && [ -f .env ]; then
  url=$(grep -E '^DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//")
fi
if [ -z "$url" ]; then
  echo "! DATABASE_URL is not set in .env: skipping database migrations"
  exit 0
fi
export DATABASE_URL="$url"

# psql from the official image, so the Droplet needs nothing but Docker. The URL
# is passed as an environment variable, never on a command line (ps would show it).
run_psql() {
  if [ -n "${MIGRATE_PSQL:-}" ]; then # tests substitute their own psql
    $MIGRATE_PSQL "$@"
    return
  fi
  docker run --rm -i -e DATABASE_URL -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
    sh -c 'exec psql "$DATABASE_URL" "$@"' psql "$@"
}

run_psql -X -q -v ON_ERROR_STOP=1 -c "
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"

applied=$(run_psql -X -q -t -A -v ON_ERROR_STOP=1 -c "select version from supabase_migrations.schema_migrations")

count=0
for file in supabase/migrations/*.sql; do
  base=$(basename "$file" .sql)
  if ! [[ "$base" =~ ^([0-9]{14})_([a-z0-9_]+)$ ]]; then
    echo "✗ Unexpected migration file name: $file (expected 20261231000000_name.sql)"
    exit 1
  fi
  version="${BASH_REMATCH[1]}"
  name="${BASH_REMATCH[2]}"
  if grep -qx "$version" <<<"$applied"; then
    continue
  fi
  echo "→ Applying migration $base"
  {
    cat "$file"
    printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" "$version" "$name"
  } | run_psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f -
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "✓ Database is up to date"
else
  echo "✓ Applied $count migration(s)"
fi
