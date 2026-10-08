// Server only: the shared pool's group flow (phase 1 — family shares for Pchum Ben).
//
//   Money in   a payment slip posted in the pool's group, or a KHQR payment AUTOBOK
//              pushes with the pool's key → "💵 Received $100 from SOK DARA! Which
//              family share is this?" with one button per unpaid share; the
//              treasurer (the keeper, or a Telegram admin of the group) taps →
//              recorded, and the live progress message is updated:
//              📊 5/10 គ្រួសារបានបង់ ($500 / $1,000) [██████████░░░░░░░░░░] 50%
//              with [🔔 រំលឹកអ្នកមិនទាន់បង់] and [🏁 បិទ & ទូទាត់] (opens the pool in the app).
//   Money out  the keeper types "ទិញផ្លែឈើ 40,000៛" (no /spend needed) or posts a slip
//              paying someone else → spent from the pool, with the template category
//              (ទាន/បច្ច័យ · សាំង/ធ្វើដំណើរ · ម្ហូបអាហារ/ជួបជុំ) when the words say so.
//   Closing    the summary (collected, spent by category, refund per share), the
//              summary card image, and for family / festival pools a Khmer blessing.
import QRCode from "qrcode"

import { parseAmountText, toLatinDigits } from "@/lib/bot/parse-entry"
import type { Slip } from "@/lib/bot/bank-slip"
import { formatMoney } from "@/lib/money"
import { poolEmoji, toSnapshot, type PoolSnapshot } from "@/lib/pool"
import { CLOSING_BLESSING, takesBlessing } from "@/lib/pool-blessing"

import { isGroupAdmin } from "./biz-slip-bot"
import { appUrl } from "./community-bulletin"
import { logEvent } from "./events"
import { poolCard, spentByCategory } from "./pool-card"
import { readSlip } from "./slip-bot"
import { botDb, botKey, botToken, maskNumbers, tg } from "./telegram-bot"

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const unitWord = (p: Pick<PoolSnapshot, "unit">) => (p.unit === "FAMILY" ? "គ្រួសារ" : "នាក់")

/** The template category a spending note points to (null → the pool's general category). */
export function poolPreset(text: string): "pool_offering" | "pool_travel" | "pool_food" | null {
  if (/បច្ច័យ|ទាន|វត្ត|ព្រះសង្ឃ|ចង្ហាន់|បិណ្ឌ|ធូប|ទៀន|offering|pagoda|monk/i.test(text)) return "pool_offering"
  if (/សាំង|ប្រេង|ឡាន|រថយន្ត|ធ្វើដំណើរ|តាក់ស៊ី|ឡានក្រុង|fuel|petrol|taxi|bus|van/i.test(text)) return "pool_travel"
  if (/បាយ|ម្ហូប|ផ្លែឈើ|នំ|ភេសជ្ជៈ|ទឹកក្រូច|សាច់|ត្រី|បន្លែ|អាហារ|food|fruit|drink/i.test(text)) return "pool_food"
  return null
}

/** "📊 5/10 គ្រួសារបានបង់ ($500 / $1,000)\n[██████████░░░░░░░░░░] ៥០%" */
export function progressText(p: PoolSnapshot): string {
  // Shares only (a name with no share isn't one to count), against the target — the single source for every pool message.
  const shares = p.members.filter((m) => m.pledged > 0)
  const paid = shares.filter((m) => m.paid >= m.pledged).length
  const total = shares.length || p.members.length
  const target = p.target > 0 ? p.target : p.pooled
  const pct = target > 0 ? Math.min(100, Math.round((p.pooled / target) * 100)) : 0
  const filled = Math.round(pct / 5)
  return [
    `${poolEmoji(p.kind)} ${p.title}`,
    `📊 ${kmDigits(`${paid}/${total}`)} ${unitWord(p)}បានបង់ (${formatMoney(p.pooled, p.currency)} / ${formatMoney(target, p.currency)})`,
    `[${"█".repeat(filled)}${"░".repeat(20 - filled)}] ${kmDigits(String(pct))}%`,
    ...(p.spent > 0 ? [`🧾 ចំណាយ ${formatMoney(p.spent, p.currency)} · នៅសល់ ${formatMoney(p.remaining, p.currency)}`] : []),
  ].join("\n")
}

async function progressKeyboard(p: PoolSnapshot) {
  const url = await appUrl()
  const rows: { text: string; callback_data?: string; url?: string }[][] = [
    ...(p.khqr ? [[{ text: KHQR_BUTTON, callback_data: `pq:${p.id}` }]] : []),
    [{ text: "🔔 រំលឹកអ្នកមិនទាន់បង់", callback_data: `pr:${p.id}` }],
  ]
  if (url && p.id) rows.push([{ text: "🏁 បិទ និងទូទាត់ (ក្នុងកម្មវិធី)", url: `${url}/pools/${p.id}` }])
  return { inline_keyboard: rows }
}

/** The live progress message: edited in place, or posted (and remembered) when there is none. */
export async function postProgress(chatId: number, p: PoolSnapshot) {
  if (!p.id) return
  const text = progressText(p)
  const reply_markup = await progressKeyboard(p)
  if (p.progress_msg) {
    const r = await tg("editMessageText", { chat_id: chatId, message_id: p.progress_msg, text, reply_markup })
    if (r.ok || /not modified/i.test(r.description ?? "")) return
  }
  const sent = await tg<{ message_id: number }>("sendMessage", { chat_id: chatId, text, reply_markup })
  if (sent.ok && sent.result) await botDb().rpc("bot_pool_progress_msg", { p_key: botKey(), p_pool_id: p.id, p_msg: sent.result.message_id })
}

async function groupSnapshot(chatId: number): Promise<PoolSnapshot | null> {
  const { data } = await botDb().rpc("bot_pool_group", { p_key: botKey(), p_group: chatId })
  return data ? toSnapshot(data as PoolSnapshot) : null
}

type Opened = { status: string; id?: string; chat_id?: number | null; title?: string; unit?: string; amount?: number; currency?: "USD" | "KHR"; payer?: string | null; unpaid?: { id: string; name: string; due: number }[] }

/** "💵 ទទួលបាន $100 ពី SOK DARA! តើជាចំណែករបស់គ្រួសារណា?" + one button per unpaid share. */
export async function askShare(chatId: number, o: Opened, replyTo?: number) {
  if (!o.id || !o.unpaid?.length) return
  const who = o.unit === "FAMILY" ? "គ្រួសារណា" : "អ្នកណា"
  const buttons = o.unpaid.map((m, i) => ({ text: `${m.name}${m.due > 0 ? ` · ${formatMoney(m.due, o.currency ?? "USD")}` : ""}`, callback_data: `pp:${o.id}:${i}` }))
  const rows: (typeof buttons)[] = []
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
  await tg("sendMessage", {
    chat_id: chatId,
    text: maskNumbers(`💵 ទទួលបាន ${formatMoney(Number(o.amount), o.currency ?? "USD")}${o.payer ? ` ពី ${o.payer}` : ""}!\nតើជាចំណែករបស់${who}? (អ្នកកាន់បេឡា ឬ Admin ចុចជ្រើសរើស)`),
    reply_markup: { inline_keyboard: rows },
    ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
  })
}

/** AUTOBOK pushed a payment with a pool key: ask the pool's group which share it is. */
export async function announcePoolPayment(o: Opened) {
  if (o.status === "ok" && o.chat_id) await askShare(Number(o.chat_id), o)
}

/** Loose name match ("SOU CHENDA" ~ "Chenda Sou"). */
const sameName = (a: string | null | undefined, b: string | null | undefined) => {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))
  if (!a || !b) return false
  const x = words(a)
  return [...words(b)].some((w) => x.has(w))
}

/**
 * A photo in a pool group: a payment into the pool → the "which share?"
 * question; a slip of the keeper paying someone else → spent from the pool.
 * Photos that aren't bank slips (family pictures…) are left alone.
 */
export async function handlePoolSlip(chatId: number, photo: { fileId: string; fileUniqueId: string | null; messageId: number; fromId: number; caption: string | null }): Promise<boolean> {
  const p = await groupSnapshot(chatId)
  if (!p || p.status !== "active") return false
  const read = await readSlip(photo.fileId)
  if ("error" in read) {
    if (read.error === "busy") await tg("sendMessage", { chat_id: chatId, text: "⚠️ មិនអាចអានវិក្កយបត្របានឥឡូវនេះ — សូមផ្ញើម្ដងទៀតបន្តិចក្រោយ។", reply_to_message_id: photo.messageId })
    return true
  }
  const slip: Slip = read.slip
  const { data: keeper } = await botDb().rpc("bot_pool_is_keeper", { p_key: botKey(), p_group: chatId, p_from: photo.fromId })
  const toKeeper = slip.direction === "IN" || sameName(slip.party, p.keeper)
  if (keeper === true && slip.direction === "OUT" && !toKeeper) {
    // The treasurer paid someone: spend it from the pool.
    const note = [photo.caption?.trim() || null, slip.party].filter(Boolean).join(" · ") || null
    const { data } = await botDb().rpc("bot_pool_spend", {
      p_key: botKey(),
      p_group: chatId,
      p_from: photo.fromId,
      p_amount: slip.amount,
      p_currency: slip.currency,
      p_note: note,
      p_photo: photo.fileId,
      p_preset: poolPreset(`${note ?? ""}`),
    })
    if ((data as { status?: string } | null)?.status === "ok") {
      const { flushPoolPosts } = await import("./pool-bot")
      await flushPoolPosts((data as { pool_id: string }).pool_id)
    }
    return true
  }
  // Money into the pool: who paid (the slip owner when they sent it, the other party when the keeper received it).
  const payer = slip.direction === "OUT" ? (slip.owner ?? null) : (slip.party ?? slip.owner ?? null)
  const { data } = await botDb().rpc("bot_pool_payment_in", {
    p_key: botKey(),
    p_group: chatId,
    p_pay: { amount: slip.amount, currency: slip.currency, payer, ref: photo.fileUniqueId ?? photo.fileId.slice(-40), receipt: photo.fileId },
  })
  const o = data as Opened | null
  if (o?.status === "ok") await askShare(chatId, o, photo.messageId)
  else if (o?.status === "duplicate") await tg("sendMessage", { chat_id: chatId, text: "ℹ️ វិក្កយបត្រនេះបានកត់ត្រារួចហើយ។", reply_to_message_id: photo.messageId })
  return true
}

/** The keeper's plain "ទិញផ្លែឈើ 40,000៛" in the pool group (no /spend needed). True when it was one. */
export async function handlePoolSpendText(chatId: number, fromId: number, text: string): Promise<boolean> {
  const input = toLatinDigits(text)
  const amount = parseAmountText(input)
  if (!amount) return false
  const { data: keeper } = await botDb().rpc("bot_pool_is_keeper", { p_key: botKey(), p_group: chatId, p_from: fromId })
  if (keeper !== true) return false
  const p = await groupSnapshot(chatId)
  if (!p) return false
  const note = `${input.slice(0, amount.start)} ${input.slice(amount.end)}`.replace(/\s+/g, " ").trim()
  const { data } = await botDb().rpc("bot_pool_spend", {
    p_key: botKey(),
    p_group: chatId,
    p_from: fromId,
    p_amount: amount.value,
    p_currency: amount.currency ?? p.currency,
    p_note: note || null,
    p_photo: null,
    p_preset: poolPreset(note),
  })
  if ((data as { status?: string } | null)?.status === "ok") {
    const { flushPoolPosts } = await import("./pool-bot")
    await flushPoolPosts((data as { pool_id: string }).pool_id)
  }
  return true
}

export const isPoolFlowCallback = (data: string | undefined) => /^p[prq]:/.test(data ?? "")

/** The button that shows the pool's KHQR to anyone in the group. */
export const KHQR_BUTTON = "💳 ស្កេនបង់ប្រាក់ KHQR"
const khqrShownAt = new Map<string, number>()

type Callback = { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat: { id: number; type: string } } }

const remindedAt = new Map<string, number>()

/** pp:<pending>:<i> (which share) and pr:<pool> (remind the unpaid). Treasurer or group admins only. */
export async function handlePoolFlowCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const chatId = cb.message?.chat.id
  if (!chatId || !cb.from) return answer()
  const db = botDb()
  const admin = await isGroupAdmin(chatId, cb.from.id)

  if (cb.data?.startsWith("pp:")) {
    const [, id, index] = cb.data.split(":", 3)
    if (!UUID.test(id ?? "") || !/^\d+$/.test(index ?? "")) return answer()
    const { data } = await db.rpc("bot_pool_payment_assign", { p_key: botKey(), p_group: chatId, p_from: cb.from.id, p_admin: admin, p_pending: id, p_choice: Number(index) })
    const r = data as { status?: string; member?: string; amount?: number; currency?: "USD" | "KHR"; payer?: string | null } | null
    if (r?.status === "not_keeper") return answer("សម្រាប់អ្នកកាន់បេឡា ឬ Admin របស់ក្រុមប៉ុណ្ណោះ។", true)
    if (r?.status === "done") return answer("បានកត់ត្រារួចហើយ។", true)
    if (r?.status !== "ok") return answer("ផុតកំណត់ ឬមិនអាចកត់ត្រាបានទេ។", true)
    await answer("✅")
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: cb.message!.message_id,
      text: maskNumbers(`✅ ${r.member} បានបង់ ${formatMoney(Number(r.amount), r.currency ?? "USD")}${r.payer ? ` (ពី ${r.payer})` : ""}`),
    }).catch(() => null)
    const p = await groupSnapshot(chatId)
    if (p) await postProgress(chatId, p)
    return
  }

  // pq:<pool> — anyone: the pool's KHQR image to scan and pay (at most every 2 minutes per pool).
  if (cb.data?.startsWith("pq:")) {
    const p = await groupSnapshot(chatId)
    if (!p?.id || !p.khqr) return answer("បេឡានេះមិនទាន់មាន KHQR ទេ — អ្នកកាន់បេឡាអាចដាក់វាក្នុងកម្មវិធី។", true)
    if (Date.now() - (khqrShownAt.get(p.id) ?? 0) < 2 * 60_000) return answer("KHQR ទើបតែផ្ញើខាងលើ 👆")
    khqrShownAt.set(p.id, Date.now())
    await answer("📲")
    await sendWithKhqr(chatId, p, `📲 ${p.title}\nសូមស្កេន KHQR ដើម្បីបង់ចំណែក (${p.keeper || "អ្នកកាន់បេឡា"}) ហើយផ្ញើរូបវិក្កយបត្រក្នុងក្រុមនេះ — លុយឆ្លាតនឹងកត់ត្រាជូន។ 🙏`)
    return
  }

  // pr:<pool> — remind who hasn't paid, with the keeper's KHQR (at most every 30 minutes).
  const { data: keeper } = await db.rpc("bot_pool_is_keeper", { p_key: botKey(), p_group: chatId, p_from: cb.from.id })
  if (!admin && keeper !== true) return answer("សម្រាប់អ្នកកាន់បេឡា ឬ Admin របស់ក្រុមប៉ុណ្ណោះ។", true)
  const p = await groupSnapshot(chatId)
  if (!p?.id) return answer()
  if (Date.now() - (remindedAt.get(p.id) ?? 0) < 30 * 60_000) return answer("បានរំលឹករួចហើយ — សូមរង់ចាំបន្តិច។", true)
  remindedAt.set(p.id, Date.now())
  const unpaid = p.members.filter((m) => m.pledged > 0 && m.paid < m.pledged)
  if (!unpaid.length) return answer("🎉 គ្រប់គ្នាបានបង់រួចហើយ!", true)
  await answer("🔔")
  const lines = [
    `🔔 សូមរំលឹកដោយក្ដីគោរព — ${p.title}`,
    `${unitWord(p)}ដែលមិនទាន់បង់៖`,
    ...unpaid.map((m) => `• ${m.name} — ${formatMoney(m.pledged - m.paid, p.currency)}`),
    "",
    p.khqr ? `សូមស្កេន KHQR ខាងក្រោមដើម្បីបង់ (${p.keeper || "អ្នកកាន់បេឡា"}) ហើយផ្ញើរូបវិក្កយបត្រក្នុងក្រុមនេះ។ 🙏` : "សូមបង់ទៅអ្នកកាន់បេឡា ហើយផ្ញើរូបវិក្កយបត្រក្នុងក្រុមនេះ។ 🙏",
  ]
  await sendWithKhqr(chatId, p, lines.join("\n"))
}

/** A message with the pool's KHQR as a scannable image (plain text when the pool has none). */
async function sendWithKhqr(chatId: number, p: PoolSnapshot, text: string) {
  const caption = text.slice(0, 1000)
  const token = botToken()
  if (p.khqr && token) {
    const png = await QRCode.toBuffer(p.khqr, { width: 640, margin: 2, errorCorrectionLevel: "M" })
    const form = new FormData()
    form.append("chat_id", String(chatId))
    form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "khqr.png")
    form.append("caption", caption)
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch(() => null)
    if (res?.ok) return
    logEvent("warn", "pool", "Pool KHQR photo not sent — sending the text", { fold: true })
  }
  await tg("sendMessage", { chat_id: chatId, text: caption })
}

/**
 * Right after a group is linked: the pool introduced — what each share is, the target,
 * and the pool's KHQR to scan — then the live progress message.
 */
export async function introducePool(chatId: number) {
  const p = await groupSnapshot(chatId)
  if (!p?.id || p.status !== "active") return
  const shares = p.members.filter((m) => m.pledged > 0)
  const each = new Set(shares.map((m) => m.pledged))
  const target = shares.reduce((s, m) => s + m.pledged, 0)
  const lines = [
    `${poolEmoji(p.kind)} ${p.title}`,
    ...(shares.length && each.size === 1
      ? [`${shares.length} ${unitWord(p)} × ${formatMoney(shares[0].pledged, p.currency)} = ${formatMoney(target, p.currency)}`]
      : target > 0
        ? [`គោលដៅ៖ ${formatMoney(target, p.currency)}`]
        : []),
    "",
    p.khqr
      ? `📲 សូមស្កេន KHQR ខាងក្រោមដើម្បីបង់ចំណែក (${p.keeper || "អ្នកកាន់បេឡា"}) ហើយផ្ញើរូបវិក្កយបត្រក្នុងក្រុមនេះ — លុយឆ្លាតនឹងកត់ត្រាជូន។ 🙏`
      : "📲 សូមបង់ទៅអ្នកកាន់បេឡា ហើយផ្ញើរូបវិក្កយបត្រក្នុងក្រុមនេះ — លុយឆ្លាតនឹងកត់ត្រាជូន។ 🙏",
  ]
  await sendWithKhqr(chatId, p, lines.join("\n"))
  await postProgress(chatId, p).catch(() => null)
}

export { CLOSING_BLESSING }

/** The closing post: summary text (by category, refund per share), the card image, and the blessing. */
export async function postClosing(chatId: number, p: PoolSnapshot) {
  const s = p.settlement
  const lines = [
    `🏁 បិទបេឡារួម · ${p.title}`,
    "",
    `💵 ប្រមូលបានសរុប៖ ${formatMoney(p.pooled, p.currency)}`,
    `🧾 ចំណាយសរុប៖ ${formatMoney(p.spent, p.currency)}`,
    ...spentByCategory(p).map((c) => `   • ${c.name} — ${formatMoney(c.amt, p.currency)}`),
    `💰 នៅសល់៖ ${formatMoney(p.remaining, p.currency)}`,
  ]
  if (s && s.shares.length && s.mode !== "ROLLOVER") {
    const amounts = new Set(s.shares.map((x) => x.amount))
    const head = s.mode === "REFUND" ? "ប្រាក់សល់ត្រឡប់វិញ" : "ត្រូវបង់បន្ថែម"
    lines.push("", amounts.size === 1 ? `↩️ ${head}៖ ${formatMoney(s.shares[0].amount, p.currency)} ក្នុងមួយ${unitWord(p)}` : `↩️ ${head}៖`)
    if (amounts.size > 1) for (const x of s.shares) lines.push(`   • ${x.name} — ${formatMoney(x.amount, p.currency)}`)
  } else if (s?.mode === "ROLLOVER") lines.push("", "🔁 ប្រាក់នៅសល់ ផ្ទេរទៅបេឡាលើកក្រោយ។")
  const festive = takesBlessing(p)
  const token = botToken()
  try {
    if (token) {
      const form = new FormData()
      form.append("chat_id", String(chatId))
      form.append("photo", new Blob([new Uint8Array(poolCard(p))], { type: "image/png" }), "pool-summary.png")
      form.append("caption", lines.join("\n").slice(0, 1000))
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) })
    } else await tg("sendMessage", { chat_id: chatId, text: lines.join("\n") })
  } catch (e) {
    logEvent("error", "pool", `Closing card failed: ${(e as Error).message}`, { fold: true })
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n") })
  }
  if (festive) await tg("sendMessage", { chat_id: chatId, text: CLOSING_BLESSING })
}
