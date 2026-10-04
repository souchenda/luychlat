#!/usr/bin/env bash
# Activate the official Telegram bot after a deploy (same as /admin › "Activate bot"):
#   - store the SHA-256 of the bot key (derived from TELEGRAM_BOT_TOKEN) in bot_config,
#   - point Telegram's webhook at this site and set the bot's command menu.
# Run by update.sh once the new container is healthy; safe to run by hand any time:
#   ./deploy/bot-activate.sh
#
# Needs TELEGRAM_BOT_TOKEN and DATABASE_URL in .env; skipped otherwise (the app
# still works, and an admin can activate the bot in /admin). The token is only
# read inside the app container from its environment: it is never printed,
# logged or put on a command line. The public address comes from PUBLIC_URL in
# .env, or from Nginx's server_name.
set -euo pipefail

cd "$(dirname "$0")/.."

env_value() {
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']\$//" || true
}

if [ -z "$(env_value TELEGRAM_BOT_TOKEN)" ]; then
  echo "! TELEGRAM_BOT_TOKEN is not set in .env: skipping bot activation"
  exit 0
fi
url="${DATABASE_URL:-$(env_value DATABASE_URL)}"
if [ -z "$url" ]; then
  echo "! DATABASE_URL is not set in .env: activate the bot in /admin instead"
  exit 0
fi
export DATABASE_URL="$url"

public_url="${PUBLIC_URL:-$(env_value PUBLIC_URL)}"
if [ -z "$public_url" ]; then
  # The Nginx site that serves this app (its config proxies to the luysmart_app upstream,
  # see deploy/nginx/); other sites on the same Droplet are ignored.
  site=$(grep -lE 'proxy_pass[[:space:]]+http://luysmart_app' /etc/nginx/sites-enabled/* 2>/dev/null | head -n 1 || true)
  if [ -n "$site" ]; then
    host=$(grep -hoE '^[[:space:]]*server_name[[:space:]]+[^;]+' "$site" | awk '{print $2}' | grep -vE '^(_|localhost|[0-9.]+)$' | head -n 1 || true)
    [ -n "$host" ] && public_url="https://$host"
  fi
fi
if [ -z "$public_url" ]; then
  echo "! Couldn't tell this app's public address: set PUBLIC_URL=https://… in .env (bot not activated)"
  exit 0
fi

# Derive the key hash and talk to Telegram from inside the container (the token is in its env).
result=$(docker compose exec -T -e PUBLIC_URL="$public_url" app node -e '
const c = require("crypto")
const t = process.env.TELEGRAM_BOT_TOKEN || ""
if (!t) { console.log("ERR no_token_in_container"); process.exit(0) }
const h = (label) => c.createHmac("sha256", t).update(label).digest("hex")
const hash = c.createHash("sha256").update(h("luychlat-bot-rpc")).digest("hex")
const api = (m, b) => fetch("https://api.telegram.org/bot" + t + "/" + m, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json()).catch(() => ({ ok: false, description: "network" }))
;(async () => {
  const me = await api("getMe")
  if (!me.ok) { console.log("ERR bad_token"); return }
  let hook = "no_public_url"
  if (process.env.PUBLIC_URL) {
    const r = await api("setWebhook", { url: process.env.PUBLIC_URL + "/api/telegram/webhook", secret_token: h("luychlat-webhook"), allowed_updates: ["message", "callback_query"] })
    hook = r.ok ? "ok" : "failed"
  }
  await api("setMyCommands", { commands: [
    { command: "start", description: "ភ្ជាប់គណនី LuyChlat · Connect your account" },
    { command: "help", description: "ជំនួយ · Help" },
    { command: "market", description: "ហាងឆេងទីផ្សារ (ប្តូរប្រាក់ មាស ប្រេងសាំង) · Market rates · 市场行情" },
    { command: "rate", description: "អត្រាប្ដូរប្រាក់ · Exchange rate · 汇率 (/rate 100 usd to khr)" },
    { command: "gold", description: "តម្លៃមាស · Gold price · 金价 (/gold 2 ជី)" },
    { command: "fuel", description: "តម្លៃប្រេង & ហ្កាស · Fuel & gas prices · 油价" },
    { command: "digest", description: "សង្ខេបប្រចាំសប្ដាហ៍ · Weekly digest · 每周摘要" },
    { command: "nssf", description: "ប.ស.ស. · NSSF cards & info · 国家社保" },
    { command: "lang", description: "ភាសា · Language · 语言 (ខ្មែរ / 中文 / English)" },
    { command: "stop", description: "ផ្ដាច់ · Disconnect" },
  ] })
  console.log("OK " + hash + " " + me.result.username + " " + hook)
})()
' 2>/dev/null || echo "ERR container")

read -r status hash username hook <<<"$result"
if [ "$status" != "OK" ]; then
  echo "! Bot activation skipped: ${hash:-unknown error} (the app is deployed; check TELEGRAM_BOT_TOKEN)"
  exit 0
fi

# psql from the official image (as in migrate.sh); values go in as psql variables.
run_psql() {
  if [ -n "${MIGRATE_PSQL:-}" ]; then
    $MIGRATE_PSQL "$@"
    return
  fi
  docker run --rm -i -e DATABASE_URL -e PGCONNECT_TIMEOUT=15 postgres:17-alpine \
    sh -c 'exec psql "$DATABASE_URL" "$@"' psql "$@"
}

run_psql -X -q -v ON_ERROR_STOP=1 -v hash="$hash" -v username="$username" -f - <<'SQL'
insert into public.bot_config (id, key_hash, username, updated_at) values (1, :'hash', :'username', now())
on conflict (id) do update set key_hash = excluded.key_hash, username = excluded.username, updated_at = now();
insert into public.app_settings (key, value, updated_at) values ('telegram_bot', jsonb_build_object('username', :'username'), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
SQL

echo "✓ Bot @$username activated (webhook: $hook)"
