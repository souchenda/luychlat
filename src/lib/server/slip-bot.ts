// Server only: a bank slip photo in the private chat → Gemini Vision reads the
// amount, currency, bank and date → a card with one-tap category buttons →
// one tap saves it (with the slip's date, and the photo kept as the receipt).
//
// Privacy: only the slip photo goes to Gemini (the same server key as voice
// notes); wallets and categories are matched here. The card is plain text and
// passes through maskNumbers (account numbers on the slip never echo back).
import { categoryFor, cleanSlip, pickWallet, slipChoices, type Slip } from "@/lib/bot/bank-slip"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { convert, formatMoney } from "@/lib/money"
import { blocked, botContext, contextLocale, workspacesOf, type Context } from "@/lib/server/bot-commands"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, maskNumbers, sendText, telegramFile, tg, tr } from "@/lib/server/telegram-bot"

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Gemini Vision costs quota shared with voice notes and /ai: a few slips per hour per chat.
const SLIPS_PER_HOUR = 20
const recent = new Map<number, number[]>()
function slipAllowed(chatId: number) {
  const now = Date.now()
  const times = (recent.get(chatId) ?? []).filter((t) => now - t < 3_600_000)
  if (times.length >= SLIPS_PER_HOUR) return false
  recent.set(chatId, [...times, now])
  return true
}

const PROMPT = [
  "This photo should be a Cambodian bank transfer or payment slip / receipt (ACLEDA, ABA, Wing, Bakong / KHQR, Canadia, Prince, etc.), possibly a phone screenshot.",
  "Read it and answer JSON only:",
  '{"is_slip": boolean, "amount": number, "currency": "USD" | "KHR", "direction": "OUT" | "IN", "bank": string, "date": "YYYY-MM-DD" | null, "party": string | null}',
  "amount: the transferred / paid amount only (not fees, not a balance). Riel (៛, KHR) has no decimals.",
  "direction: OUT if the slip owner sent or paid money (Transfer to, Paid to, Payment), IN if they received it.",
  "bank: the app or bank that issued the slip. date: the transaction date. party: the recipient (OUT) or sender (IN) name as printed.",
  'If it is not a slip or the amount is unreadable, answer {"is_slip": false}.',
].join("\n")

type ReadResult = { slip: Slip } | { error: "unreadable" | "busy" }

/** Reads the slip photo with Gemini Vision (retrying brief overloads). */
async function readSlip(fileId: string): Promise<ReadResult> {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) return { error: "busy" }
  const file = await telegramFile(fileId)
  if (!file) return { error: "unreadable" }
  const request = () =>
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: file.type, data: Buffer.from(file.bytes).toString("base64") } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    })
  try {
    let res = await request()
    for (const wait of [1500, 4000]) {
      if (res.ok || !(res.status === 429 || res.status >= 500)) break
      await new Promise((resolve) => setTimeout(resolve, wait))
      res = await request()
    }
    if (!res.ok) {
      logEvent("error", "slips", `Gemini slip read failed: HTTP ${res.status}`, { fold: true })
      return { error: "busy" }
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")
    const slip = cleanSlip(JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()))
    return slip ? { slip } : { error: "unreadable" }
  } catch {
    return { error: "unreadable" }
  }
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** A slip photo in the private chat (gated by plan and the bank_slips feature in the webhook). */
export async function handleSlipPhoto(chatId: number, fileId: string, ctx: Context | null) {
  const lang = contextLocale(ctx)
  if (!ctx?.linked) return sendText(chatId, tr(lang, "bot.notLinked"))
  const stop = blocked(ctx, lang)
  if (stop) return sendText(chatId, stop)
  if (!slipAllowed(chatId)) return sendText(chatId, tr(lang, "bot.slipLimit"))

  // Reading takes a few seconds: keep "typing…" up meanwhile.
  const typing = () => void tg("sendChatAction", { chat_id: chatId, action: "typing" })
  typing()
  const keepTyping = setInterval(typing, 4500)
  let read: ReadResult
  try {
    read = await readSlip(fileId)
  } finally {
    clearInterval(keepTyping)
  }
  if ("error" in read) return sendText(chatId, tr(lang, read.error === "busy" ? "bot.slipBusy" : "bot.slipUnreadable"))
  const slip = read.slip

  // The default workspace (Personal unless the user chose another for the bot).
  const ws = workspacesOf(ctx)[0]
  const wallet = pickWallet(slip, ws.wallets)
  if (!wallet) return sendText(chatId, tr(lang, "bot.cmdNoWallet"))
  const kind = slip.direction === "IN" ? "INCOME" : "EXPENSE"
  const note = ["🧾", slip.bank, slip.party ? `${slip.direction === "IN" ? "←" : "→"} ${slip.party}` : null].filter(Boolean).join(" ").slice(0, 200)
  const action = {
    kind,
    wallet_id: wallet.id,
    category_id: null,
    amount: slip.amount,
    currency: slip.currency,
    note,
    date: slip.date,
    receipt: fileId,
    text: note,
    heard: null,
  }
  const { data: pendingId, error } = await botDb().rpc("bot_propose", { p_key: botKey(), p_chat_id: chatId, p_action: action })
  if (error || typeof pendingId !== "string") return sendText(chatId, tr(lang, "bot.saveFailed"))

  const money = formatMoney(slip.amount, slip.currency)
  const lines = [
    tr(lang, "bot.slipTitle", { bank: slip.bank ? ` · ${slip.bank}` : "" }),
    tr(lang, kind === "INCOME" ? "bot.slipIn" : "bot.slipOut"),
    `💵 ${money}`,
    wallet.currency === slip.currency
      ? `👛 ${wallet.name}`
      : `👛 ${wallet.name} (≈ ${formatMoney(convert(slip.amount, slip.currency, wallet.currency, ws.rate), wallet.currency)})`,
    ...(slip.date ? [`📅 ${ddmmyyyy(slip.date)}`] : []),
    ...(slip.party ? [`${slip.direction === "IN" ? "↩️" : "➡️"} ${slip.party}`] : []),
    "",
    tr(lang, "bot.slipAsk"),
  ]
  const buttons = slipChoices(kind).map((c, i) => ({ text: tr(lang, c.label), callback_data: `sc:${pendingId}:${i}` }))
  const keyboard: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2))
  keyboard.push([{ text: tr(lang, "bot.cancel"), callback_data: `no:${pendingId}` }])
  return sendText(chatId, lines.join("\n"), { reply_markup: { inline_keyboard: keyboard } })
}

export const isSlipCallback = (data: string | undefined) => Boolean(data?.startsWith("sc:"))

type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }
type Pending = { kind?: "EXPENSE" | "INCOME"; workspace_id?: string; amount?: number; currency?: "USD" | "KHR"; wallet_id?: string }

/** A category button under a slip card: save with that category, then show the result on the card. */
export async function handleSlipCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const [, pendingId, index] = (cb.data ?? "").split(":", 3)
  const chatId = cb.message?.chat.id
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(pendingId ?? "") || !/^\d$/.test(index ?? "")) return answer()
  const ctx = await botContext(chatId)
  const lang: Locale = contextLocale(ctx)
  if (!ctx?.linked) return answer(tr(lang, "bot.notLinked"), true)

  const { data } = await botDb().rpc("bot_pending", { p_key: botKey(), p_chat_id: chatId, p_pending_id: pendingId })
  const action = data as Pending | null
  if (!action?.kind || (action.kind !== "EXPENSE" && action.kind !== "INCOME")) return answer(tr(lang, "bot.expired"), true)
  const choice = slipChoices(action.kind)[Number(index)]
  const ws = workspacesOf(ctx).find((w) => w.id === action.workspace_id)
  const category = choice && ws ? categoryFor(choice, action.kind, ws.categories) : null
  if (!choice || !category) return answer(tr(lang, "bot.saveFailed"), true)

  const label = tr(lang, choice.label as MessageKey)
  const { data: result, error } = await botDb().rpc("bot_confirm_category", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_pending_id: pendingId,
    p_category_id: category.id,
    p_note_tag: choice.tag ? label : null,
  })
  if (error) {
    const msg = error.message ?? ""
    const why = /plan_required/.test(msg) ? "bot.cmdPro" : /commands_off/.test(msg) ? "bot.cmdOff" : /not_writable/.test(msg) ? "bot.cmdReadonly" : "bot.saveFailed"
    return answer(tr(lang, why), true)
  }
  const r = result as { ok?: boolean; wallet?: string } | null
  if (!r?.ok) return answer(tr(lang, "bot.expired"), true)

  await answer(tr(lang, "bot.slipSaved"))
  const text = [
    tr(lang, "bot.slipSaved"),
    `💵 ${formatMoney(Number(action.amount), action.currency ?? "USD")}`,
    `👛 ${r.wallet ?? ""}`,
    `🏷️ ${label}`,
  ].join("\n")
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(text) })
}

/** Webhook entry: a private photo from a linked chat. */
export async function handlePrivatePhoto(chatId: number, fileId: string) {
  const ctx = await botContext(chatId)
  return handleSlipPhoto(chatId, fileId, ctx)
}
