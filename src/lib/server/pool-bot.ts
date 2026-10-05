// Server only: shared pools (បេឡារួម) in a Telegram group the keeper linked.
//   /pool, /fund, /trip       the pool's picture (anyone in that group)
//   /pool link CODE           link this group (the keeper, code from the app)
//   /spend 45$ បាយថ្ងៃត្រង់   log an expense (the keeper only)
// New entries — from /spend, the app or the keeper's private chat — are posted
// to the group by the dispatcher. Only the pool's own wallet is ever shown.
// Receipt photos: /spend as a photo caption, or a photo sent as a reply to an
// expense card; kept on Telegram (<keeper>/tg/<file id>), shown through the app.
import { parseAmountText, toLatinDigits } from "@/lib/bot/parse-entry"
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { GAUGE_EMOJI, poolEmoji, toSnapshot, type PoolSnapshot } from "@/lib/pool"
import { botDb, botKey, sendText, tr } from "@/lib/server/telegram-bot"

const khmerDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const asLocale = (l: unknown): Locale => (l === "en" || l === "zh" ? l : "km")

/** "💰 លុយបេឡារួមនៅសល់៖ $155.00 / $250.00 (៦២%) 🟢" */
function balanceLine(p: PoolSnapshot, lang: Locale) {
  const pct = Math.max(0, Math.round(p.pct))
  return tr(lang, "pool.bot.balance", {
    remaining: formatMoney(p.remaining, p.currency),
    pooled: formatMoney(p.pooled, p.currency),
    pct: lang === "km" ? khmerDigits(String(pct)) : String(pct),
    gauge: GAUGE_EMOJI[p.gauge],
  })
}

/** The low-funds warning with the suggested top-up. */
function lowLine(p: PoolSnapshot, lang: Locale) {
  return p.topup_per_member
    ? tr(lang, "pool.bot.low", { remaining: formatMoney(p.remaining, p.currency), each: formatMoney(p.topup_per_member, p.currency) })
    : tr(lang, "pool.bot.lowNoHint", { remaining: formatMoney(p.remaining, p.currency) })
}

/** /pool: everything at a glance. */
function snapshotText(p: PoolSnapshot, lang: Locale) {
  const lines = [
    `${poolEmoji(p.kind)} ${p.title}${p.status === "settled" ? ` · ${tr(lang, "pool.bot.closed")}` : ""}`,
    tr(lang, "pool.bot.pooled", { amount: formatMoney(p.pooled, p.currency) }),
    tr(lang, "pool.bot.spent", { amount: formatMoney(p.spent, p.currency) }),
    balanceLine(p, lang),
  ]
  if (p.top.length) {
    lines.push("", tr(lang, "pool.bot.top"))
    for (const x of p.top) lines.push(`• ${x.note ?? "—"} — ${formatMoney(x.amt, p.currency)}`)
  }
  if (p.status === "active" && p.gauge === "low") lines.push("", lowLine(p, lang))
  return lines.join("\n")
}

function settlementText(p: PoolSnapshot, lang: Locale) {
  const s = p.settlement
  if (!s) return snapshotText(p, lang)
  const head =
    s.mode === "REFUND"
      ? tr(lang, "pool.bot.settleRefund", { amount: formatMoney(s.remaining, p.currency) })
      : s.mode === "COLLECT"
        ? tr(lang, "pool.bot.settleCollect", { amount: formatMoney(Math.abs(s.remaining), p.currency) })
        : tr(lang, "pool.bot.settleRollover", { amount: formatMoney(s.remaining, p.currency) })
  return [`${poolEmoji(p.kind)} ${p.title}`, head, ...s.shares.map((x) => `• ${x.name} — ${formatMoney(x.amount, p.currency)}`)].join("\n")
}

/** The largest photo size up to ~1600 px (Telegram sends several). */
export function bestPhoto(sizes: { file_id: string; width?: number }[] | undefined): string | null {
  if (!sizes?.length) return null
  const fit = sizes.filter((s) => (s.width ?? 0) <= 1600)
  return (fit.length ? fit[fit.length - 1] : sizes[0]).file_id
}

type Pending = {
  pool_id: string
  chat_id: number | null
  items: { id?: string; receipt?: boolean; type: "INCOME" | "EXPENSE"; amt: number; note: string | null }[]
  until: string | null
  low_alerted: boolean
  settle: boolean
  language: string | null
  snapshot: PoolSnapshot
}

/** Posts what linked groups haven't seen yet (new entries, low funds, closings). */
export async function flushPoolPosts(poolId?: string) {
  const { data, error } = await botDb().rpc("bot_pool_pending", { p_key: botKey(), p_pool_id: poolId ?? null })
  if (error || !Array.isArray(data)) return
  for (const raw of data as Pending[]) {
    const p = toSnapshot(raw.snapshot)
    const lang = asLocale(raw.language)
    let low: boolean | null = null
    if (raw.chat_id && raw.items.length) {
      const lines = raw.items.slice(-10).map((i) =>
        i.type === "EXPENSE"
          ? tr(lang, "pool.bot.expense", { note: i.note ?? "—", amount: formatMoney(Number(i.amt), p.currency) }) + (i.receipt ? " 📎" : "")
          : tr(lang, "pool.bot.income", { note: i.note ?? "—", amount: formatMoney(Number(i.amt), p.currency) }),
      )
      if (raw.items.length > 10) lines.unshift(tr(lang, "pool.bot.more", { count: raw.items.length - 10 }))
      lines.push(balanceLine(p, lang))
      // Warn once each time the pool drops into the red.
      if (p.status === "active" && p.gauge === "low" && !raw.low_alerted) {
        lines.push(lowLine(p, lang))
        low = true
      } else if (p.gauge !== "low") low = false
      const sent = await sendText(raw.chat_id, lines.join("\n"))
      // One expense per card: remember it, so a photo replied to the card becomes its receipt.
      const only = raw.items.length === 1 && raw.items[0].type === "EXPENSE" ? raw.items[0].id : undefined
      const messageId = (sent as { result?: { message_id?: number } }).result?.message_id
      if (only && messageId) await botDb().rpc("bot_pool_remember", { p_key: botKey(), p_chat: raw.chat_id, p_message_id: messageId, p_transaction_id: only })
    }
    if (raw.settle && raw.chat_id) await sendText(raw.chat_id, settlementText(p, lang))
    await botDb().rpc("bot_pool_posted", { p_key: botKey(), p_pool_id: raw.pool_id, p_until: raw.until, p_low: low, p_settled: raw.settle })
  }
}

/** Group commands for pools; true when the message was one of them. */
/** A photo replied to an expense card: attach it as that entry's receipt (keeper only). */
export async function handlePoolPhotoReply(chatId: number, fromId: number | undefined, replyTo: number, fileId: string, lang: Locale) {
  if (!fromId) return
  const { data } = await botDb().rpc("bot_pool_attach", { p_key: botKey(), p_group: chatId, p_from: fromId, p_message_id: replyTo, p_photo: fileId })
  const status = (data as { status?: string } | null)?.status
  // Silence for photos that weren't meant as receipts (a reply to something else).
  if (status === "ok") await sendText(chatId, tr(lang, "pool.bot.photoAttached"))
  else if (status === "not_keeper") await sendText(chatId, tr(lang, "pool.bot.notKeeper"))
}

export async function handlePoolGroupCommand(chatId: number, fromId: number | undefined, text: string, fallback: Locale, photoId: string | null = null): Promise<boolean> {
  const [command, ...rest] = text.trim().split(/\s+/)
  const name = command.split("@")[0].toLowerCase()
  if (!["/pool", "/fund", "/trip", "/spend"].includes(name)) return false
  const db = botDb()

  if (name !== "/spend" && rest[0]?.toLowerCase() === "link") {
    if (!fromId) return true
    const { data } = await db.rpc("bot_pool_link", { p_key: botKey(), p_group: chatId, p_from: fromId, p_code: rest[1] ?? "" })
    const r = data as { status: string; title?: string } | null
    await sendText(chatId, r?.status === "ok" ? tr(fallback, "pool.bot.linked", { title: r.title ?? "" }) : r?.status === "not_linked" ? tr(fallback, "pool.bot.linkNotLinked") : tr(fallback, "pool.bot.badCode"))
    return true
  }

  const { data: snap } = await db.rpc("bot_pool_group", { p_key: botKey(), p_group: chatId })
  if (!snap) {
    await sendText(chatId, tr(fallback, "pool.bot.noPool"))
    return true
  }
  const pool = toSnapshot(snap as PoolSnapshot)
  const lang = asLocale((snap as { language?: string }).language ?? fallback)

  if (name !== "/spend") {
    await sendText(chatId, snapshotText(pool, lang))
    return true
  }

  // /spend 45$ បាយថ្ងៃត្រង់ — the keeper only; an amount without a currency is in the pool's.
  const input = toLatinDigits(rest.join(" "))
  const amount = parseAmountText(input)
  if (!amount || !fromId) {
    await sendText(chatId, tr(lang, "pool.bot.spendHelp"))
    return true
  }
  const note = `${input.slice(0, amount.start)} ${input.slice(amount.end)}`.replace(/\s+/g, " ").trim()
  const { data } = await db.rpc("bot_pool_spend", {
    p_key: botKey(),
    p_group: chatId,
    p_from: fromId,
    p_amount: amount.value,
    p_currency: amount.currency ?? pool.currency,
    p_note: note || null,
    p_photo: photoId,
  })
  const r = data as { status: string; pool_id?: string } | null
  if (r?.status === "ok") await flushPoolPosts(r.pool_id)
  else await sendText(chatId, tr(lang, r?.status === "not_keeper" ? "pool.bot.notKeeper" : r?.status === "no_pool" ? "pool.bot.closedNoSpend" : "pool.bot.spendHelp"))
  return true
}
