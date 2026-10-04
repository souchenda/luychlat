// Server only: quick invoices from Telegram (/invoice, "គិតលុយ 12$ …").
// The receipt is sent as a photo the merchant can forward to the customer,
// with ✅ received / ❌ cancel buttons under it.
import { parseInvoiceText } from "@/lib/bot/parse-invoice"
import type { Locale } from "@/lib/i18n/dictionaries"
import { toInvoice, type ReceiptData } from "@/lib/invoice"
import { formatMoney } from "@/lib/money"
import { botContext, contextLocale } from "@/lib/server/bot-commands"
import { receiptPng } from "@/lib/server/receipt-image"
import { botDb, botKey, botToken, sendText, tg, tr } from "@/lib/server/telegram-bot"

type InvoiceCallback = { id: string; data?: string; message?: { message_id: number; caption?: string; chat: { id: number; type: string } } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** True for the ✅ / ❌ buttons under a receipt ("ip:<id>", "ic:<id>"). */
export const isInvoiceCallback = (data: string | undefined) => /^i[pc]:/.test(data ?? "")

const buttons = (lang: Locale, id: string) => ({
  inline_keyboard: [[{ text: tr(lang, "bot.invoiceBtnPaid"), callback_data: `ip:${id}` }], [{ text: tr(lang, "bot.invoiceBtnCancel"), callback_data: `ic:${id}` }]],
})

function caption(lang: Locale, r: ReceiptData) {
  const inv = r.invoice
  const head = `🧾 ${inv.invoice_number} · ${formatMoney(inv.total_amount, inv.currency)}${inv.customer_name ? ` · ${inv.customer_name}` : ""}`
  return [head, tr(lang, r.khqr ? "bot.invoiceForward" : "bot.invoiceNoQr")].join("\n")
}

/** Sends a photo (multipart upload); edits one in place when messageId is given. */
async function photo(chatId: number, png: Buffer, text: string, opts: { messageId?: number; reply_markup?: unknown }) {
  const token = botToken()
  if (!token) return
  const form = new FormData()
  form.append("chat_id", String(chatId))
  if (opts.messageId) {
    form.append("message_id", String(opts.messageId))
    form.append("media", JSON.stringify({ type: "photo", media: "attach://receipt", caption: text.slice(0, 1000) }))
    form.append("receipt", new Blob([new Uint8Array(png)], { type: "image/png" }), "receipt.png")
  } else {
    form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "receipt.png")
    form.append("caption", text.slice(0, 1000))
  }
  if (opts.reply_markup) form.append("reply_markup", JSON.stringify(opts.reply_markup))
  await fetch(`https://api.telegram.org/bot${token}/${opts.messageId ? "editMessageMedia" : "sendPhoto"}`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null)
}

const asReceipt = (r: ReceiptData): ReceiptData => ({ ...r, invoice: toInvoice(r.invoice) })

/** /invoice and "គិតលុយ …" from a private chat. */
export async function handleInvoiceMessage(chatId: number, text: string, fallback: Locale) {
  const ctx = await botContext(chatId)
  if (!ctx?.linked) return sendText(chatId, tr(fallback, "bot.help"))
  const lang = contextLocale(ctx)
  const parsed = parseInvoiceText(text)
  if (!parsed.ok) return sendText(chatId, tr(lang, "bot.invoiceHelp"))

  const { data, error } = await botDb().rpc("bot_create_invoice", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_total: parsed.total,
    p_currency: parsed.currency,
    p_customer: parsed.customer,
    p_items: parsed.items,
    p_notes: parsed.notes,
  })
  const r = data as ({ status: string } & Partial<ReceiptData>) | null
  if (error || !r) return sendText(chatId, tr(lang, "bot.saveFailed"))
  if (r.status === "limit") return sendText(chatId, tr(lang, "bot.invoiceLimit"))
  if (r.status === "not_writable") return sendText(chatId, tr(lang, "bot.cmdReadonly"))
  if (r.status !== "ok" || !r.invoice) return sendText(chatId, tr(lang, r.status === "invalid" ? "bot.invoiceHelp" : "bot.saveFailed"))

  await tg("sendChatAction", { chat_id: chatId, action: "upload_photo" })
  const receipt = asReceipt(r as ReceiptData)
  await photo(chatId, receiptPng(receipt, lang), caption(lang, receipt), { reply_markup: buttons(lang, receipt.invoice.id) })
}

type ActionResult = { status: string; logged?: boolean; wallet?: string | null; receipt?: ReceiptData | null }

/** ✅ received (logs the income) / ❌ cancel under a receipt: redraws it with the stamp, without buttons. */
export async function handleInvoiceCallback(cb: InvoiceCallback) {
  const chatId = cb.message?.chat.id
  const [verb, id] = (cb.data ?? "").split(":", 2)
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(id ?? "")) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const ctx = await botContext(chatId)
  const lang = contextLocale(ctx)
  const { data, error } = await botDb().rpc("bot_invoice_action", { p_key: botKey(), p_chat_id: chatId, p_invoice_id: id, p_action: verb === "ip" ? "paid" : "cancel" })
  const r = data as ActionResult | null
  const note =
    error || !r
      ? tr(lang, "bot.saveFailed")
      : r.status === "paid"
        ? r.logged
          ? tr(lang, "bot.invoicePaid", { wallet: r.wallet ?? "" })
          : tr(lang, "bot.invoicePaidNoWallet")
        : r.status === "cancelled_now"
          ? tr(lang, "bot.invoiceCancelled")
          : r.status === "already"
            ? tr(lang, "bot.invoiceAlready")
            : r.status === "cancelled"
              ? tr(lang, "bot.invoiceWasCancelled")
              : r.status === "not_writable"
                ? tr(lang, "bot.cmdReadonly")
                : tr(lang, "bot.invoiceGone")
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: note.slice(0, 190) })
  if (!r?.receipt) return
  // The receipt again, now stamped PAID / CANCELLED, and the outcome in the caption.
  const receipt = asReceipt(r.receipt)
  const head = (cb.message?.caption ?? "").split("\n")[0] || caption(lang, receipt).split("\n")[0]
  await photo(chatId, receiptPng(receipt, lang), `${head}\n${note}`, { messageId: cb.message!.message_id })
}
