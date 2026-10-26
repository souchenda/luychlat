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

# What a commit changed, in Khmer for the founder (founder, 20/10/2026 — the card showed raw English git subjects):
# the body's «Khmer: …» (or «KH: …») line; else deploy/release-notes-km.tsv («hash<TAB>Khmer», for commits written
# before the rule); else the subject when it is written in Khmer, without its «feat(…):» prefix; else only the kind of
# change in Khmer — never English developer jargon. One line per commit: «hash<US>summary».
khmer_summaries() {
  git log --format='%h%x1f%s%x1f%b%x1e' "$@" | PYTHONIOENCODING=utf-8 python3 -c '
import re, sys
KINDS = {"feat": "✨ មុខងារថ្មី", "fix": "🔧 ការជួសជុល", "perf": "⚡ ធ្វើឱ្យលឿនជាងមុន", "docs": "📄 ឯកសារណែនាំ", "chore": "🧹 ការថែទាំប្រព័ន្ធ",
         "refactor": "🧱 រៀបចំកូដឡើងវិញ", "test": "🧪 ការធ្វើតេស្ត", "style": "🎨 រូបរាង", "ci": "⚙️ ប្រព័ន្ធដាក់ឱ្យដំណើរការ", "build": "⚙️ ប្រព័ន្ធដាក់ឱ្យដំណើរការ"}
notes = {}
try:
    for row in open("deploy/release-notes-km.tsv", encoding="utf-8"):
        k, _, v = row.rstrip("\n").partition("\t")
        if k and v.strip():
            notes[k.strip()] = v.strip()
except OSError:
    pass
khmer = lambda s: len(re.findall("[ក-៿]", s))
latin = lambda s: len(re.findall("[A-Za-z]", s))
for rec in sys.stdin.read().split("\x1e"):
    rec = rec.strip("\n")
    if not rec:
        continue
    h, subject, body = (rec.split("\x1f") + ["", ""])[:3]
    m = re.match(r"^(\w+)(?:\([^)]*\))?!?:\s*(.*)$", subject)
    kind, text = (m.group(1).lower(), m.group(2).strip()) if m else ("", subject.strip())
    line = next((x.group(1).strip() for x in (re.match(r"^\s*(?:Khmer|KH)\s*:\s*(.+)$", l, re.I) for l in body.splitlines()) if x), None)
    line = line or next((v for k, v in notes.items() if h.startswith(k) or k.startswith(h)), None)
    if not line and khmer(text) > latin(text):
        line = text
    if not line:
        line = KINDS.get(kind, "🛠️ ការកែលម្អ") + " (ផ្នែកបច្ចេកទេស)"
    print(h + "\x1f" + line[:300])
'
}

# One short line (founder, 20/10/2026): at most 80 characters, cut between words with «…» when longer.
short_line() {
  PYTHONIOENCODING=utf-8 python3 -c '
import sys
lines = sys.stdin.read().strip().splitlines()
t = lines[0] if lines else ""
if len(t) > 80:
    cut = t[:79]
    t = (cut[: cut.rfind(" ")] if " " in cut[40:] else cut).rstrip(" —,") + "…"
print(t)
'
}

env_value() { grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

kind=${1:-ok}
head=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
full=$(git rev-parse HEAD 2>/dev/null || echo "?")

# Task numbers instead of commit hashes (founder, 20/10/2026): every release gets the next number — «កិច្ចការទី #N» —
# kept on the server («N <commit>» per line, outside git, so a pull never resets it). A commit that names its task
# («Task: #049» or «កិច្ចការ: #049» in its message) gets that number. A redeploy of the same commit keeps its number.
TASKS=deploy/run/task-numbers
task_number() {
  local tag known last prev range
  # The task this release carries (Task #515): named in ANY of its commits since the last announced release — «Task #514»
  # with or without a colon (before, only «Task: #N» counted, and two tasks shipped in one release or a task without a
  # deploy pushed the counter off: Task #514 showed as #512). The highest wins; deploy/task-tag.sh reads them.
  prev=$(awk 'END { print $2 }' "$TASKS" 2>/dev/null)
  # Unknown or unrelated last release (a first run, a rewritten history): this commit alone.
  range="-1 $full"
  if [ -n "$prev" ] && [ "$prev" != "$full" ] && git merge-base --is-ancestor "$prev" "$full" 2>/dev/null; then range="-n 40 $prev..$full"; fi
  tag=$(git log --format='%B%x1e' $range 2>/dev/null | sh deploy/task-tag.sh)
  if [ -n "$tag" ]; then echo $((10#$tag)); return; fi
  known=$(awk -v h="$full" '$2 == h { n = $1 } END { if (n) print n }' "$TASKS" 2>/dev/null)
  if [ -n "$known" ]; then echo "$known"; return; fi
  last=$(awk '$1 + 0 > max { max = $1 + 0 } END { print max + 0 }' "$TASKS" 2>/dev/null)
  # The first time: number the releases so far from the deploy log (this one's «✓ Deployed» line is already in it).
  if [ "${last:-0}" = "0" ]; then
    last=$(grep -c "✓ Deployed" /var/log/luysmart-deploy.log 2>/dev/null || echo 0)
    [ "$kind" = "ok" ] && last=$((last - 1))
  fi
  echo $((last + 1))
}
task=$(task_number)

if [ "$kind" = "fail" ]; then
  # Once per commit: the cron retries a failed version every 5 minutes.
  mkdir -p deploy/run
  [ "$(cat deploy/run/.failed-notified 2>/dev/null)" = "$head" ] && exit 0
  echo "$head" > deploy/run/.failed-notified
  # The step in Khmer (update.sh names it).
  case "${2:-}" in
    "database migration") step="ការធ្វើបច្ចុប្បន្នភាពមូលដ្ឋានទិន្នន័យ" ;;
    build*) step="ការសាងសង់ និងការធ្វើតេស្តកំណែថ្មី" ;;
    "container start") step="ការចាប់ផ្ដើមកំណែថ្មី" ;;
    "health check") step="កំណែថ្មីមិនឆ្លើយតបការត្រួតពិនិត្យសុខភាព" ;;
    "Nginx switch") step="ការប្តូរទៅកំណែថ្មី (Nginx)" ;;
    *) step=$(printf '%s' "${2:-?}" | esc) ;;
  esac
  # Three lines (founder, 20/10/2026): what, why, and that the running version is untouched.
  text="⚠️ <b>កិច្ចការទី #$task មិនបាន Live</b>
• <b>មូលហេតុ៖</b> ${step}
• <b>Server៖</b> 🟢 កំណែមុននៅដើរធម្មតា"
else
  rm -f deploy/run/.failed-notified
  prev=${2:-}
  free=$(df -h / | awk 'NR==2 { sub(/G$/, " GB", $4); print $4 }')
  slot=$(cat deploy/run/active-slot 2>/dev/null || echo "?")
  container=$([ "$slot" = "green" ] && echo luysmart-green || echo luysmart)
  health=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "?")
  # Every commit this release shipped (newest first), beyond the headline one.
  # This release's number, kept once per commit (lost in b9ac958 — two releases showed #374; regression test below).
  mkdir -p deploy/run
  awk -v h="$full" '$2 == h { found = 1 } END { exit !found }' "$TASKS" 2>/dev/null || echo "$task $full" >> "$TASKS"
  # Three lines (founder, 20/10/2026 — easy to scan): the task, the change in one short Khmer line, the server.
  extra=""
  if [ -n "$prev" ] && git cat-file -e "$prev" 2>/dev/null && [ "$(git rev-parse "$prev")" != "$(git rev-parse HEAD)" ]; then
    count=$(git rev-list --count "$prev"..HEAD)
    [ "$count" -gt 1 ] && extra=" (+$((count - 1)) ទៀត)"
    summary=$(khmer_summaries -1 | cut -d$'\x1f' -f2 | short_line | esc)
  elif [ -n "$prev" ]; then
    summary="ចាប់ផ្ដើមឡើងវិញ (ការកំណត់ .env) — គ្មានកូដថ្មី"
  else
    summary=$(khmer_summaries -1 | cut -d$'\x1f' -f2 | short_line | esc)
  fi
  [ "$health" = "healthy" ] && server="🟢 ដើរល្អ" || server="🟠 $health"
  text="🚀 <b>កិច្ចការទី #$task បាន Live</b>$extra
• <b>ខ្លឹមសារ៖</b> $summary
• <b>Server៖</b> $server (${free:-?} ទំនេរ)"
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
echo "Deploy notice ($kind $head, task #$task) sent to $sent chat(s)"
exit 0
