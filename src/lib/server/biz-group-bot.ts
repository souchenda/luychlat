// Server only: business KHQR groups. In a group linked to a BUSINESS workspace
// (/biz link CODE), the banks' payment notifications (ACLEDA, ABA PayWay) are
// recorded as Sales income in real time, once per bank reference, with a short
// "✅ +$1.00 បានកត់ត្រា (DL MEAT SUPPLY · ACLEDA)" in the group.
//
// The bot reads every message only when it is an admin of the group or its
// group privacy is off (BotFather › /setprivacy › Disable).
import { parseMerchantPayment } from "@/lib/bot/merchant-khqr"
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"

import { logEvent } from "./events"
import { botDb, botKey, sendText, tr } from "./telegram-bot"

type Recorded = { transaction_id?: string; amount?: number; currency?: "USD" | "KHR"; wallet?: string; workspace?: string; bank?: string }

/**
 * The group confirmation for a KHQR sale — LuyChlat is the only responder (AUTOBOK in Quiet Mode):
 *   ✅ +1,275,000៛ បានកត់ត្រា (ABA DL KHR)
 *   📊 ថ្ងៃនេះ៖ 2,994,000៛ • 2 ប្រតិបត្តិការ
 */
export async function recordedText(r: Recorded, lang: Locale, fallbackBank: string): Promise<string> {
  const currency = r.currency ?? "USD"
  const head = tr(lang, "biz.recordedWallet", {
    amount: `+${formatMoney(Number(r.amount), currency)}`,
    wallet: r.wallet ?? `${r.workspace ?? ""} · ${r.bank ?? fallbackBank}`,
  })
  if (!r.transaction_id) return head
  const { data } = await botDb().rpc("bot_khqr_today", { p_key: botKey(), p_transaction_id: r.transaction_id })
  const d = data as { total: number; count: number; currency: "USD" | "KHR" } | null
  return d ? `${head}\n${tr(lang, "biz.today", { total: formatMoney(Number(d.total), d.currency), count: d.count })}` : head
}

/** Post a confirmation in a group: one retry, and a failure is logged — never silent. */
export async function announce(chatId: number, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await sendText(chatId, text)
    if (res.ok) return true
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2000))
    else logEvent("warn", "khqr", `KHQR group confirmation not sent: ${res.description ?? "unknown"}`, { fold: true })
  }
  return false
}

export type TransferResult = { amount?: number; currency?: "USD" | "KHR"; bank?: string; from_wallet?: string; from_bank?: string | null; suffix?: string }

/** "🔄 បានកត់ត្រាការផ្ទេរប្រាក់ផ្ទៃក្នុង៖ ACLEDA (*262) ➔ ABA (21,600,000៛)" — the owner's own move, not a sale. */
export function transferText(r: TransferResult): string {
  return tr("km", "biz.transferRecorded", {
    from: r.from_bank || r.from_wallet || "—",
    suffix: r.suffix ?? "",
    to: r.bank ?? "",
    amount: formatMoney(Number(r.amount), r.currency ?? "USD"),
  })
}

/** A KHQR payment notification in a group: record it if the group is linked. True when it was one. */
export async function handleKhqrGroupMessage(chatId: number, text: string, lang: Locale): Promise<boolean> {
  const pay = parseMerchantPayment(text)
  if (!pay) return false
  const { data, error } = await botDb().rpc("bot_khqr_sale", {
    p_key: botKey(),
    p_group: chatId,
    p_pay: {
      bank: pay.bank,
      amount: pay.amount,
      currency: pay.currency,
      payer: pay.payer,
      ref: pay.ref,
      posted_at: pay.postedAt,
      payer_account: pay.payerAccount,
      merchant: pay.merchant,
    },
  })
  const r = data as ({ status?: string } & Recorded) | null
  if (error || !r) {
    logEvent("error", "khqr", `KHQR sale failed in a group: ${error?.message ?? "no result"}`, { fold: true })
    return true
  }
  if (r.status === "ok") {
    logEvent("info", "khqr", `KHQR ${pay.bank} payment recorded (${r.workspace})`, { fold: true })
    await announce(chatId, await recordedText({ ...r, currency: r.currency ?? pay.currency }, lang, pay.bank))
  } else if (r.status === "transfer") {
    logEvent("info", "khqr", `KHQR ${pay.bank} own transfer recorded (${r.workspace})`, { fold: true })
    await announce(chatId, transferText(r as TransferResult))
  } else if (r.status === "no_wallet") {
    await sendText(chatId, tr(lang, "biz.noWallet", { workspace: r.workspace ?? "" }))
  } else if (r.status === "plan_required") {
    await sendText(chatId, tr(lang, "pool.bot.planRequired"))
  }
  // duplicate / not_linked / invalid: stay quiet (retries, or a group that isn't linked).
  return true
}

/** /biz and /biz link CODE in a group. True when handled. */
export async function handleBizGroupCommand(chatId: number, fromId: number | undefined, text: string, title: string | undefined, lang: Locale): Promise<boolean> {
  const [command, ...rest] = text.trim().split(/\s+/)
  if (!/^\/biz(@\w+)?$/i.test(command ?? "")) return false
  const db = botDb()
  if (rest[0]?.toLowerCase() === "link") {
    if (!fromId) return true
    const { data } = await db.rpc("bot_biz_link", { p_key: botKey(), p_group: chatId, p_from: fromId, p_code: rest[1] ?? "", p_title: title ?? null })
    const r = data as { status?: string; workspace?: string } | null
    const reply =
      r?.status === "ok"
        ? tr(lang, "biz.linked", { workspace: r.workspace ?? "" })
        : r?.status === "not_linked"
          ? tr(lang, "pool.bot.linkNotLinked")
          : r?.status === "plan_required"
            ? tr(lang, "pool.bot.planRequired")
            : tr(lang, "pool.bot.badCode")
    await sendText(chatId, reply)
    return true
  }
  const { data } = await db.rpc("bot_biz_group", { p_key: botKey(), p_group: chatId })
  const ws = (data as { workspace?: string } | null)?.workspace
  await sendText(chatId, ws ? tr(lang, "biz.status", { workspace: ws }) : tr(lang, "biz.notLinked"))
  return true
}
