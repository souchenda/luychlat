#!/bin/sh
# The app hard down (founder, 17/10/2026): https://app.luychlat.com/api/health checked from OUTSIDE the app every
# minute (cron) — the app can't report its own 502. Five failures in a row (5+ minutes) → ONE Telegram message;
# one more when it answers again. Nothing else is ever sent from here (no CPU / RAM noise).
# Where: DEVOPS_CHAT_ID («chat» or «chat:topic») from /opt/luysmart/.env, else the super admins' linked chats.
# The bot token and the database URL are read from .env and never printed.
set -u
APP_DIR=/opt/luysmart
STATE=/tmp/luysmart-uptime
URL=https://app.luychlat.com/api/health
FAILS_TO_PAGE=5

env_value() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$URL" || echo 000)
fails=$(cat "$STATE.fails" 2>/dev/null || echo 0)
paged=$(cat "$STATE.paged" 2>/dev/null || echo 0)

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

if [ "$code" = "200" ]; then
  if [ "$paged" = "1" ]; then
    send "✅ អេប លុយឆ្លាត ដំណើរការវិញហើយ (app.luychlat.com ឆ្លើយតប 200)។"
  fi
  echo 0 > "$STATE.fails"
  echo 0 > "$STATE.paged"
  exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE.fails"
if [ "$fails" -ge "$FAILS_TO_PAGE" ] && [ "$paged" != "1" ]; then
  send "🔴 អេប លុយឆ្លាត មិនដំណើរការ (app.luychlat.com → HTTP $code) ជាង $FAILS_TO_PAGE នាទីហើយ។ សូមពិនិត្យ Droplet (docker ps · /var/log/luysmart-deploy.log)។"
  echo 1 > "$STATE.paged"
fi
