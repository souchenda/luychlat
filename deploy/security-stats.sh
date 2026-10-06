#!/usr/bin/env bash
# Super Admin › Development › Security: requests per minute from Nginx's access
# log into public.security_traffic — total, dropped by the flood guard (444),
# rate-limited (429) and server errors (5xx). Each run recounts the last
# WINDOW minutes (default 15) and overwrites those rows, so runs never double-count.
#   bash deploy/security-stats.sh          # cron, every 5 minutes
#   bash deploy/security-stats.sh 1440     # backfill the last day
# Sites with access_log off (dl / test.ibmserp.com) aren't in this log.
set -euo pipefail

cd "$(dirname "$0")/.."
WINDOW="${1:-15}"
LOG="${NGINX_ACCESS_LOG:-/var/log/nginx/access.log}"
[ -r "$LOG" ] || exit 0

url="${DATABASE_URL:-}"
if [ -z "$url" ] && [ -f .env ]; then
  url=$(grep -E '^DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//")
fi
[ -z "$url" ] && exit 0
export DATABASE_URL="$url"

sql=$(python3 - "$LOG" "$WINDOW" <<'PY'
import re, sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

log, window = sys.argv[1], int(sys.argv[2])
since = datetime.now(timezone.utc) - timedelta(minutes=window)
# 1.2.3.4 - - [07/Oct/2026:00:13:36 +0700] "GET /?s=… HTTP/1.1" 444 0 …
line_re = re.compile(r'\[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}):\d{2} ([+-]\d{4})\] "[^"]*" (\d{3}) ')
buckets = defaultdict(lambda: [0, 0, 0, 0])
with open(log, errors="replace") as f:
    for line in f:
        m = line_re.search(line)
        if not m:
            continue
        at = datetime.strptime(f"{m.group(1)} {m.group(2)}", "%d/%b/%Y:%H:%M %z")
        if at < since:
            continue
        status = int(m.group(3))
        b = buckets[at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")]
        b[0] += 1
        b[1] += status == 444
        b[2] += status == 429
        b[3] += status >= 500
if buckets:
    rows = ",".join(f"('{k}',{v[0]},{v[1]},{v[2]},{v[3]})" for k, v in sorted(buckets.items()))
    print("insert into public.security_traffic (minute, total, blocked, limited, errors) values " + rows +
          " on conflict (minute) do update set total = excluded.total, blocked = excluded.blocked, limited = excluded.limited, errors = excluded.errors;")
PY
)

[ -z "$sql" ] && exit 0
printf '%s\n' "$sql" | docker run --rm -i -e DATABASE_URL -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
  sh -c 'exec psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1' >/dev/null
