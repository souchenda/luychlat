#!/bin/sh
# luychlat.com watched from outside, every 5 minutes (founder, 27/10/2026 — «how do I know if something goes wrong?»):
#   1. the site answers — https://luychlat.com/ with HTTP 200 and the brand on the page; 3 misses in a row (15 min) →
#      ONE Telegram message, one more when it is back;
#   2. the files are the ones published — /var/www/luychlat-landing must match the manifest deploy/landing-publish.sh
#      wrote; any change, added or removed file (a break-in, a hand edit) → ONE message at once, until it matches again.
# Where: DEVOPS_CHAT_ID («chat» or «chat:topic») from /opt/luysmart/.env, else the super admins' linked chats (as
# deploy/uptime-watch.sh). The bot token and the database URL are read from .env and never printed.
set -u
APP_DIR=${APP_DIR:-/opt/luysmart}
SITE=${SITE:-/var/www/luychlat-landing}
MANIFEST=${MANIFEST:-/var/lib/luychlat-landing/manifest.sha256}
STATE=${STATE:-/tmp/luychlat-landing-watch}
URL=${URL:-https://luychlat.com/}
FAILS_TO_PAGE=3

env_value() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

send() {
  token=$(env_value TELEGRAM_BOT_TOKEN)
  [ -n "$token" ] || return 0
  route=$(env_value DEVOPS_CHAT_ID)
  if [ -n "$route" ]; then
    chats=${route%%:*}
    thread=""
    case "$route" in *:*) thread=${route#*:} ;; esac
  else
    db=$(env_value DATABASE_URL)
    chats=$(docker run --rm -e DATABASE_URL="$db" postgres:17-alpine sh -c 'psql "$DATABASE_URL" -At -c "select l.chat_id from public.telegram_links l join public.app_admins a on a.user_id = l.user_id and a.role = '"'"'super_admin'"'"' where l.chat_id is not null"' 2>/dev/null)
    thread=""
  fi
  for chat in $chats; do
    if [ -n "$thread" ]; then
      curl -s -m 15 -o /dev/null "https://api.telegram.org/bot$token/sendMessage" --data-urlencode "chat_id=$chat" --data-urlencode "message_thread_id=$thread" --data-urlencode "text=$1"
    else
      curl -s -m 15 -o /dev/null "https://api.telegram.org/bot$token/sendMessage" --data-urlencode "chat_id=$chat" --data-urlencode "text=$1"
    fi
  done
}

# `landing-watch.sh notify «text»`: one message by the same route (deploy/landing-publish.sh uses it).
if [ "${1:-}" = "notify" ]; then send "${2:-}"; exit 0; fi

# 1. Up, and our page
body=$(curl -s -m 20 -A "LuyChlat-landing-watch" -w '\n%{http_code}' "$URL" || printf '\n000')
code=$(printf '%s' "$body" | tail -n 1)
fails=$(cat "$STATE.fails" 2>/dev/null || echo 0)
paged=$(cat "$STATE.paged" 2>/dev/null || echo 0)
if [ "$code" = "200" ] && printf '%s' "$body" | grep -q "App Luy Chlat"; then
  [ "$paged" = "1" ] && send "✅ គេហទំព័រ luychlat.com ដំណើរការវិញហើយ។"
  echo 0 > "$STATE.fails"; echo 0 > "$STATE.paged"
else
  fails=$((fails + 1)); echo "$fails" > "$STATE.fails"
  if [ "$fails" -ge "$FAILS_TO_PAGE" ] && [ "$paged" != "1" ]; then
    send "🔴 គេហទំព័រ luychlat.com មិនដំណើរការ (HTTP $code) ជាង 15 នាទីហើយ។ អេប app.luychlat.com មិនពាក់ព័ន្ធទេ។"
    echo 1 > "$STATE.paged"
  fi
fi

# 2. The published files, unchanged
[ -f "$MANIFEST" ] || exit 0
problem=""
if ! (cd "$SITE" && sha256sum --quiet -c "$MANIFEST" >/dev/null 2>&1); then problem="ឯកសារត្រូវបានកែ ឬបាត់"; fi
extra=$(cd "$SITE" && find . -type f | sed 's|^\./||' | sort | comm -23 - "$(dirname "$MANIFEST")/files.txt" | head -5)
[ -n "$extra" ] && problem="${problem:+$problem · }មានឯកសារថ្មីមិនស្គាល់៖ $(echo $extra)"
alerted=$(cat "$STATE.tamper" 2>/dev/null || echo 0)
if [ -n "$problem" ]; then
  if [ "$alerted" != "1" ]; then
    send "⚠️ ការព្រមានសុវត្ថិភាព៖ ឯកសារគេហទំព័រ luychlat.com ខុសពីកំណែដែលបានដាក់ផ្លូវការ — $problem។ បើមិនមែនបងកែទេ សូមដាក់កំណែត្រឹមត្រូវវិញ៖ sudo sh /opt/luysmart/deploy/landing-publish.sh"
    echo 1 > "$STATE.tamper"
  fi
else
  [ "$alerted" = "1" ] && send "✅ ឯកសារគេហទំព័រ luychlat.com ត្រឡប់ដូចកំណែផ្លូវការវិញហើយ។"
  echo 0 > "$STATE.tamper"
fi
