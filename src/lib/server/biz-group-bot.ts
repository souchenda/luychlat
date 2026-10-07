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
  const r = data as { status?: string; workspace?: string; wallet?: string; amount?: number; currency?: "USD" | "KHR"; bank?: string } | null
  if (error || !r) {
    logEvent("error", "khqr", `KHQR sale failed in a group: ${error?.message ?? "no result"}`, { fold: true })
    return true
  }
  if (r.status === "ok") {
    logEvent("info", "khqr", `KHQR ${pay.bank} payment recorded (${r.workspace})`, { fold: true })
    const money = formatMoney(Number(r.amount), r.currency ?? pay.currency)
    await sendText(chatId, tr(lang, "biz.recorded", { amount: `+${money}`, workspace: r.workspace ?? "", bank: pay.bank }))
  } else if (r.status === "transfer") {
    logEvent("info", "khqr", `KHQR ${pay.bank} own transfer recorded (${r.workspace})`, { fold: true })
    await sendText(chatId, transferText(r as TransferResult))
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
