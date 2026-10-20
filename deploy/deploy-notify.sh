#!/usr/bin/env bash
# The founder hears of every production release (founder, 20/10/2026): a card in his PRIVATE Telegram chat when a
# version is live (after the health check and the switch), and one when a deploy fails — once per commit, so the
# 5-minute retries never repeat it. Never «LCA Approval» or any group: only positive (private) chat ids.
#   deploy/deploy-notify.sh ok   <previous deployed hash>
#   deploy/deploy-notify.sh fail <step> <exit code>
# Where: FOUNDER_TELEGRAM_CHAT_ID from .env, else the super admins' linked private chats. The bot token and the
# database URL are read from .env and never printed. Never fails the deploy.
set -u

cd "$(dirname "$0")/.."

env_value() { grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

kind=${1:-ok}
head=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
when=$(TZ=Asia/Phnom_Penh date '+%d/%m/%Y %H:%M')

if [ "$kind" = "fail" ]; then
  # Once per commit: the cron retries a failed version every 5 minutes.
  mkdir -p deploy/run
  [ "$(cat deploy/run/.failed-notified 2>/dev/null)" = "$head" ] && exit 0
  echo "$head" > deploy/run/.failed-notified
  step=$(printf '%s' "${2:-?}" | esc)
  text="⚠️ <b>ការដាក់ឱ្យដំណើរការមិនជោគជ័យ (Deploy Failed)</b>
• Commit: <code>$head</code> — $(git log -1 --pretty=format:%s 2>/dev/null | esc)
• មូលហេតុ: ${step} (exit ${3:-?})
• វេលាម៉ោង៖ $when
កំណែមុនកំពុងដំណើរការធម្មតា — /var/log/luysmart-deploy.log
— ប្រព័ន្ធស្វ័យប្រវត្តិ អេប លុយឆ្លាត"
else
  rm -f deploy/run/.failed-notified
  prev=${2:-}
  free=$(df -h / | awk 'NR==2 { sub(/G$/, " GB", $4); print $4 }')
  slot=$(cat deploy/run/active-slot 2>/dev/null || echo "?")
  container=$([ "$slot" = "green" ] && echo luysmart-green || echo luysmart)
  health=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "?")
  status=$([ "$health" = "healthy" ] && echo "🟢 សកម្មធម្មតា" || echo "🟠 $health")
  # Every commit this release shipped (newest first), beyond the headline one.
  more=""
  if [ -n "$prev" ] && git cat-file -e "$prev" 2>/dev/null && [ "$(git rev-parse "$prev")" != "$(git rev-parse HEAD)" ]; then
    count=$(git rev-list --count "$prev"..HEAD)
    if [ "$count" -gt 1 ]; then
      list=$(git log --pretty=format:'  - %h %s' "$prev"..HEAD | sed -n '2,6p' | cut -c1-160 | esc)
      more="
• រួមទាំង $((count - 1)) កំណែផ្សេងទៀត៖
$list"
    fi
  elif [ -n "$prev" ] && [ "$(git rev-parse "$prev" 2>/dev/null)" = "$(git rev-parse HEAD)" ]; then
    more="
• ប្រភេទ៖ ចាប់ផ្ដើមឡើងវិញ (ការកំណត់ .env ផ្លាស់ប្ដូរ) — គ្មានកូដថ្មីទេ"
  fi
  text="🚀 <b>ប្រព័ន្ធបានដាក់ឱ្យដំណើរការលើ Production (Live)</b>
• <b>កូដកំណែថ្មី (Commit)៖</b> <code>$head</code>
• <b>ខ្លឹមសារកែប្រែ៖</b> $(git log -1 --pretty=format:%s | cut -c1-300 | esc)$more
• <b>ស្ថានភាព Server៖</b> $status (${free:-?} ទំនេរ · $container)
• <b>វេលាម៉ោង៖</b> $when
• <b>តំណភ្ជាប់៖</b> https://app.luychlat.com
— ប្រព័ន្ធស្វ័យប្រវត្តិ អេប លុយឆ្លាត"
fi

token=$(env_value TELEGRAM_BOT_TOKEN)
[ -n "$token" ] || { echo "! Deploy notice not sent: no TELEGRAM_BOT_TOKEN"; exit 0; }
chats=$(env_value FOUNDER_TELEGRAM_CHAT_ID)
if [ -z "$chats" ]; then
  db=$(env_value DATABASE_URL)
  chats=$(docker run --rm -e DATABASE_URL="$db" postgres:17-alpine sh -c 'psql "$DATABASE_URL" -At -c "select l.chat_id from public.telegram_links l join public.app_admins a on a.user_id = l.user_id and a.role = '"'"'super_admin'"'"' where l.chat_id > 0"' 2>/dev/null)
fi

sent=0
for chat in $chats; do
  # A private chat only — a group or channel id is negative («LCA Approval» is -5578121916).
  case "$chat" in ''|-*|*[!0-9]*) continue ;; esac
  ok=$(curl -s -m 15 "https://api.telegram.org/bot$token/sendMessage" --data-urlencode "chat_id=$chat" --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true" --data-urlencode "text=$text" | grep -c '"ok":true')
  [ "$ok" = "1" ] && sent=$((sent + 1))
done
echo "Deploy notice ($kind $head) sent to $sent chat(s)"
exit 0
