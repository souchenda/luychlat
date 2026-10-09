// Server only: a utility bill photo sent to @luychlat_bot (EDC, AKISANI KOUR SROV,
// PPWSA…). The slip reader recognises a paper bill (not a payment receipt) and hands it
// here: the bill is read, saved as a monthly bill with its statement and a 2-day
// reminder, and the user gets the details with [💳 ស្កេនបង់ប្រាក់] (the KHQR printed on
// the bill, redrawn sharp) and [✅ បានបង់រួច] (the bill reminders' own "paid").
import QRCode from "qrcode"

import type { EacNotice } from "@/lib/eac"
import { dueDayOf, providerShort, utilityBillTitle } from "@/lib/utility-bill"
import { formatMoney } from "@/lib/money"
import type { Context } from "@/lib/server/bot-commands"
import { workspacesOf } from "@/lib/server/bot-commands"

import { khqrOnImage, readUtilityBill } from "./bill-ocr"
import { logEvent } from "./events"
import { botDb, botKey, botToken, sendText, telegramFile, tg } from "./telegram-bot"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

type Scan = { status: string; bill_id?: string; title?: string; remind_days?: number[]; statement_id?: string; next_due?: string }

export async function handleBillPhoto(chatId: number, fileId: string, ctx: Context) {
  const file = await telegramFile(fileId)
  if (!file) return sendText(chatId, "⚠️ មិនអាចបើករូបនេះបានទេ។ សូមផ្ញើម្ដងទៀត។")
  const bytes = new Uint8Array(file.bytes)
  const [bill, khqr] = await Promise.all([readUtilityBill(file.type, Buffer.from(bytes).toString("base64")), khqrOnImage(bytes)])
  if (bill === "busy") return sendText(chatId, "⏳ សេវាអានវិក្កយបត្ររវល់បន្តិច — សូមផ្ញើរូបម្ដងទៀតបន្តិចក្រោយ។")
  if (!bill) return sendText(chatId, "🤔 អានវិក្កយបត្រពីរូបនេះមិនបានទេ — សូមថតឱ្យច្បាស់ (ឃើញចំនួនទឹកប្រាក់ និងថ្ងៃផុតកំណត់)។")

  const ws = workspacesOf(ctx)[0]
  const { data, error } = await botDb().rpc("bot_bill_scan", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_workspace_id: ws.id,
    p_bill: { ...bill, title: utilityBillTitle(bill), khqr },
  })
  const r = data as Scan | null
  if (error || r?.status !== "ok" || !r.bill_id) {
    logEvent("error", "bills", `Bill photo not saved: ${error?.message ?? r?.status ?? "no result"}`, { fold: true })
    return sendText(chatId, r?.status === "not_writable" ? "⚠️ អ្នកមិនមានសិទ្ធិកត់ត្រាក្នុងកាបូបនេះទេ។" : "⚠️ មិនអាចរក្សាទុកវិក្កយបត្របានទេ។ សូមសាកម្ដងទៀត។")
  }

  const water = bill.kind === "WATER"
  const remind = Math.max(...(r.remind_days?.length ? r.remind_days : [2]))
  const usage =
    bill.usage !== null
      ? `${water ? "💧 ទឹក" : "⚡ ថាមពល"}៖ ${new Intl.NumberFormat("en-US").format(bill.usage)} ${water ? "m³" : "kWh"}${bill.rate !== null ? ` (${new Intl.NumberFormat("en-US").format(bill.rate)}${bill.currency === "KHR" ? "៛" : "$"}/${water ? "m³" : "kWh"})` : ""}`
      : null
  const due = bill.dueDate ?? r.next_due ?? null
  const text = [
    `${water ? "💧" : "💡"} ${providerShort(bill.provider, bill.kind)} បានកត់ត្រា!`,
    ...(bill.location ? [`📍 ទីតាំង៖ ${bill.location}`] : []),
    ...(usage ? [usage] : []),
    `💵 ប្រាក់ត្រូវបង់៖ ${formatMoney(bill.amount, bill.currency)}`,
    ...(due ? [`📅 ផុតកំណត់៖ ${ddmmyyyy(due)}${dueDayOf(bill.dueDate) === null ? " (ប៉ាន់ស្មាន)" : ""}`] : []),
    "",
    `ប្រព័ន្ធបានកត់ចូលក្នុង «វិក្កយបត្រត្រូវបង់» និងកំណត់រំលឹកមុន ${kmDigits(String(remind))} ថ្ងៃដោយស្វ័យប្រវត្តិ។`,
  ].join("\n")
  const row = [
    ...(khqr && r.statement_id ? [{ text: "💳 ស្កេនបង់ប្រាក់", callback_data: `bq:${r.statement_id}` }] : []),
    { text: "💵 កត់ថាបង់រួច", callback_data: `bp:${r.bill_id}:${r.next_due ?? ""}` },
  ]
  await sendText(chatId, text, { reply_markup: { inline_keyboard: [row] } })
  logEvent("info", "bills", `Utility bill saved from a Telegram photo${khqr ? " (with its KHQR)" : ""}`, { fold: true })
}

export const isBillKhqrCallback = (data: string | undefined) => /^bq:/.test(data ?? "")

type Callback = { id: string; data?: string; message?: { chat: { id: number; type: string } } }

/** [💳 ស្កេនបង់ប្រាក់]: the KHQR printed on the bill, redrawn as a sharp code to scan. */
export async function handleBillKhqrCallback(cb: Callback) {
  const answer = (text?: string) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text, show_alert: true } : {}) })
  const chatId = cb.message?.chat.id
  const id = (cb.data ?? "").slice(3)
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(id)) return answer()
  const { data } = await botDb().rpc("bot_bill_khqr", { p_key: botKey(), p_chat_id: chatId, p_statement_id: id })
  const khqr = typeof data === "string" ? data : null
  const token = botToken()
  if (!khqr || !token) return answer("រកមិនឃើញ KHQR លើវិក្កយបត្រនេះទេ។")
  await answer()
  const png = await QRCode.toBuffer(khqr, { width: 640, margin: 2, errorCorrectionLevel: "M" })
  const form = new FormData()
  form.append("chat_id", String(chatId))
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "khqr.png")
  form.append("caption", "📲 ស្កេន KHQR នេះពី App ធនាគារដើម្បីបង់វិក្កយបត្រ — រួចចុច «💵 កត់ថាបង់រួច»។")
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch(() => null)
}

const riel = (n: number) => new Intl.NumberFormat("en-US").format(n)

/**
 * An EAC notice forwarded to the bot. New bill: saved (or this month's statement of the
 * same customer's bill) as unpaid, with its reminder. Paid: that customer's unpaid
 * statement is marked paid and the expense recorded — once (forwarding it again does nothing).
 */
export async function handleEacNotice(chatId: number, n: EacNotice, ctx: Context) {
  const who = `📍 ${n.customerName ? `${n.customerName} ` : ""}(${n.customerId})`
  if (n.type === "NEW_BILL") {
    const ws = workspacesOf(ctx)[0]
    const { data, error } = await botDb().rpc("bot_bill_scan", {
      p_key: botKey(),
      p_chat_id: chatId,
      p_workspace_id: ws.id,
      p_bill: {
        kind: "ELECTRICITY",
        provider: "EAC",
        title: `ថ្លៃភ្លើង ${n.customerName ?? n.customerId}`.slice(0, 80),
        customer_id: n.customerId,
        customer_name: n.customerName,
        invoice_no: `EAC ${n.billDate ?? new Date().toISOString().slice(0, 10)}`,
        amount: n.amount,
        currency: "KHR",
      },
    })
    const r = data as Scan | null
    if (error || r?.status !== "ok") {
      logEvent("error", "bills", `EAC bill not saved: ${error?.message ?? r?.status ?? "no result"}`, { fold: true })
      return sendText(chatId, r?.status === "not_writable" ? "⚠️ អ្នកមិនមានសិទ្ធិកត់ត្រាក្នុងកាបូបនេះទេ។" : "⚠️ មិនអាចរក្សាទុកវិក្កយបត្របានទេ។ សូមសាកម្ដងទៀត។")
    }
    logEvent("info", "bills", "EAC new bill saved from a forwarded notice", { fold: true })
    return sendText(chatId, ["💡 វិក្កយបត្រអគ្គិសនីថ្មី (EAC) ត្រូវបានកត់ត្រា!", `📍 អតិថិជន៖ ${n.customerName ? `${n.customerName} ` : ""}(${n.customerId})`, `💵 ទឹកប្រាក់ត្រូវទូទាត់៖ ${riel(n.amount)} ៛`].join("\n"))
  }

  const { data, error } = await botDb().rpc("bot_eac_paid", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_customer_id: n.customerId,
    p_amount: n.amount,
    p_paid_on: n.paidDate,
  })
  const r = data as { status: string; logged?: boolean } | null
  if (error || !r) {
    logEvent("error", "bills", `EAC payment not recorded: ${error?.message ?? "no result"}`, { fold: true })
    return sendText(chatId, "⚠️ មិនអាចកត់ត្រាការបង់ប្រាក់បានទេ។ សូមសាកម្ដងទៀត។")
  }
  if (r.status === "no_bill")
    return sendText(chatId, `🤔 រកមិនឃើញវិក្កយបត្រភ្លើងរបស់អតិថិជន ${n.customerId} ទេ — សូមបញ្ជូនសារ «វិក្កយបត្រថ្មី» ពី EAC ឬថតវិក្កយបត្រជាមុនសិន។`)
  if (r.status === "already") return sendText(chatId, `✅ វិក្កយបត្រនេះបានកត់ថាបង់រួចហើយ។\n${who}`)
  if (r.status === "not_writable") return sendText(chatId, "⚠️ អ្នកមិនមានសិទ្ធិកត់ត្រាក្នុងកាបូបនេះទេ។")
  if (r.status !== "paid") return sendText(chatId, "⚠️ មិនអាចកត់ត្រាការបង់ប្រាក់បានទេ។ សូមសាកម្ដងទៀត។")
  logEvent("info", "bills", `EAC bill marked paid from a forwarded notice${r.logged ? " (expense recorded)" : ""}`, { fold: true })
  return sendText(
    chatId,
    ["✅ ការបង់ថ្លៃអគ្គិសនីជោគជ័យ!", who, `💵 បានបង់៖ ${riel(n.amount)} ៛`, r.logged ? "ប្រព័ន្ធបានកត់ត្រាជាការចំណាយរួចរាល់។" : "បានកត់ថាវិក្កយបត្របង់រួច (កញ្ចប់ FREE មិនកត់ជាការចំណាយដោយស្វ័យប្រវត្តិទេ)។"].join("\n"),
  )
}

/**
 * After a payment is saved (a slip, a bank alert): if it pays a recurring bill — its customer
 * number, or the one EDC / water / internet bill of that amount that is due — the bill is marked
 * «បង់រួច» for this cycle, and the user is told in one line. Never guessed (bot_bill_settle).
 */
export async function settleBillFromPayment(chatId: number, txId: string | null | undefined, customer: string | null | undefined, party: string | null | undefined) {
  if (!txId || !(customer || party)) return
  const { data, error } = await botDb().rpc("bot_bill_settle", { p_key: botKey(), p_chat_id: chatId, p_tx_id: txId, p_customer: customer ?? null, p_party: party ?? null })
  const r = data as { settled?: boolean; title?: string; due?: string } | null
  if (error) return logEvent("warn", "bills", `Bill settle check failed: ${error.message}`, { fold: true })
  if (!r?.settled || !r.title) return
  await sendText(chatId, `🧾 «${r.title}» ✅ បង់រួច (${ddmmyyyy(r.due ?? "")}) — កត់ដោយស្វ័យប្រវត្តិពីការបង់ប្រាក់នេះ។`)
  logEvent("info", "bills", "Bill marked paid automatically from a payment", { fold: true })
}
