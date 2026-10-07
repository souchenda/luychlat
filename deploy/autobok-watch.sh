#!/usr/bin/env bash
# AUTOBOK (KHQR payment listener, systemd unit "autobok") watcher, every minute
# from cron. Alerts the super admins' linked Telegram chats (via the LuyChlat
# bot, from inside the app container, so the token is never printed) when:
#   - the service stops (or keeps crash-restarting), and again when it is back
#   - Telegram reports a second copy polling the same bot (409 Conflict), e.g.
#     AUTOBOK started again on a PC: each copy then misses payments
# Only state changes are sent; a conflict at most every 30 minutes.
#   bash deploy/autobok-watch.sh            (installs /etc/cron.d/autobok-watch on first run)
set -uo pipefail

cd "$(dirname "$0")/.."
STATE_DIR=/var/lib/autobok-watch
mkdir -p "$STATE_DIR"
last=$(cat "$STATE_DIR/state" 2>/dev/null || echo up)

env_value() {
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//" || true
}

send() {
  local text="$1" url chats container
  url="${DATABASE_URL:-$(env_value DATABASE_URL)}"
  [ -n "$url" ] || return 0
  chats=$(docker run --rm -e DATABASE_URL="$url" -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
    sh -c 'psql "$DATABASE_URL" -X -A -t -q -c "select distinct l.chat_id from public.telegram_links l join public.app_admins a on a.user_id = l.user_id"' 2>/dev/null | tr '\n' ' ')
  [ -n "${chats// /}" ] || return 0
  container=$([ "$(cat deploy/run/active-slot 2>/dev/null)" = "green" ] && echo luysmart-green || echo luysmart)
  docker exec -e ALERT_TEXT="$text" -e ALERT_CHATS="$chats" "$container" node -e '
const t = process.env.TELEGRAM_BOT_TOKEN || ""
if (!t) process.exit(0)
;(async () => {
  for (const id of process.env.ALERT_CHATS.trim().split(/\s+/))
    await fetch("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: Number(id), text: process.env.ALERT_TEXT }) }).catch(() => null)
})()
' >/dev/null 2>&1 || true
}

# Down: not active now and still not active 10 s later (a crash restart takes 5 s).
state=up
if [ "$(systemctl is-active autobok)" != "active" ]; then
  sleep 10
  [ "$(systemctl is-active autobok)" != "active" ] && state=down
fi

if [ "$state" = down ] && [ "$last" != down ]; then
  send "🔴 AUTOBOK បានឈប់ដំណើរការលើ Server — ការទូទាត់ KHQR មិនត្រូវបានកត់ត្រាទេ រហូតដល់វាដំណើរការវិញ។
🔴 AUTOBOK stopped on the server — KHQR payments are not being recorded until it is back.
(systemctl status autobok · journalctl -u autobok)"
elif [ "$state" = up ] && [ "$last" = down ]; then
  send "✅ AUTOBOK ដំណើរការវិញហើយ — ការទូទាត់ដែលខកខាន Telegram នឹងបញ្ជូនមកវិញ (រហូតដល់ 24 ម៉ោង)។
✅ AUTOBOK is running again — Telegram re-delivers missed payments (up to 24 hours)."
fi
echo "$state" > "$STATE_DIR/state"

# A second copy polling the same bot (409 Conflict) — at most one alert per 30 minutes.
if journalctl -u autobok --since "-2 min" --no-pager -o cat 2>/dev/null | grep -qiE "409|terminated by other getUpdates"; then
  stamp="$STATE_DIR/conflict"
  if [ ! -f "$stamp" ] || [ $(( $(date +%s) - $(stat -c %Y "$stamp") )) -ge 1800 ]; then
    touch "$stamp"
    send "⚠️ AUTOBOK កំពុងដំណើរការពីរកន្លែង (ប្រហែលលើ PC ផង)។ សូមបិទវានៅលើ PC — បើមិនដូច្នោះទេ ការទូទាត់ខ្លះនឹងបាត់។
⚠️ AUTOBOK is running in two places (probably on a PC too). Please close it on the PC — otherwise some payments are missed."
  fi
fi

cron=/etc/cron.d/autobok-watch
if [ -d /etc/cron.d ] && [ ! -f "$cron" ]; then
  echo "* * * * * root bash $(pwd)/deploy/autobok-watch.sh >/dev/null 2>&1" > "$cron"
fi
