#!/usr/bin/env bash
# Record what this deploy shipped: the server's git commits go into
# public.dev_changelog (Super Admin › Development). New commits get this
# deploy's time; the very first run backfills the history with commit times.
# Run by update.sh after a successful deploy; safe to run by hand.
set -euo pipefail

cd "$(dirname "$0")/.."

url="${DATABASE_URL:-}"
if [ -z "$url" ] && [ -f .env ]; then
  url=$(grep -E '^DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//")
fi
[ -z "$url" ] && { echo "! DATABASE_URL is not set: changelog not recorded"; exit 0; }
export DATABASE_URL="$url"

# Commits as SQL (python3 escapes them; dollar quotes with a random tag).
sql=$(git log -n 1000 --format='%H%x1f%cI%x1f%s%x1f%b%x1e' | python3 -c '
import re, secrets, sys
tag = "c" + secrets.token_hex(6)
q = lambda s: f"${tag}${s}${tag}$"
rows = []
for rec in sys.stdin.read().split("\x1e"):
    rec = rec.strip("\n")
    if not rec:
        continue
    h, at, subject, body = (rec.split("\x1f") + ["", "", "", ""])[:4]
    if not re.fullmatch(r"[0-9a-f]{40}", h):
        continue
    m = re.match(r"^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$", subject)
    kind, scope, text = (m.group(1).lower(), m.group(2), m.group(3)) if m else ("other", None, subject)
    body = re.sub(r"\n*Co-Authored-By:.*$", "", body.strip(), flags=re.S | re.I)[:4000]
    rows.append("(%s, %s, %s, %s, %s, %s)" % (q(h), q(at), q(kind[:20]), q(scope[:40]) if scope else "null", q(text[:300]), q(body) if body else "null"))
if rows:
    print("with v(hash, committed_at, kind, scope, subject, body) as (values " + ",\n".join(rows) + ")")
    print("insert into public.dev_changelog (hash, committed_at, deployed_at, kind, scope, subject, body)")
    print("select v.hash, v.committed_at::timestamptz, case when (select count(*) from public.dev_changelog) = 0 then v.committed_at::timestamptz else now() end,")
    print("       v.kind, v.scope, v.subject, v.body from v on conflict (hash) do nothing;")
')

[ -z "$sql" ] && exit 0
printf '%s\n' "$sql" | docker run --rm -i -e DATABASE_URL -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
  sh -c 'exec psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1' >/dev/null
echo "✓ Changelog recorded"
