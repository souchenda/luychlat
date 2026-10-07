// Server only: a bank slip photo in the private chat → Gemini Vision reads the
// amount, currency, bank and date → a card with one-tap category buttons →
// one tap saves it (with the slip's date and time, and the photo kept as the receipt).
// The saved card then offers the meal (food, guessed from the time) and Need / Want.
//
// Privacy: only the slip photo goes to Gemini (the same server key as voice
// notes); wallets and categories are matched here. The card is plain text and
// passes through maskNumbers (account numbers on the slip never echo back).
import { MEALS, categoryFor, cleanSlip, isFoodChoice, mealFor, resolveWallet, slipChoices, walletLabel, type Meal, type Slip } from "@/lib/bot/bank-slip"
import type { BotWallet } from "@/lib/bot/parse-entry"
import { categoryLabel } from "@/lib/categories/presets"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { convert, formatMoney } from "@/lib/money"
import { blocked, botContext, contextLocale, workspacesOf, type Context } from "@/lib/server/bot-commands"
import { logEvent } from "@/lib/server/events"
import { phnomPenhToday } from "@/lib/server/market-sync"
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
  '{"is_slip": boolean, "amount": number, "currency": "USD" | "KHR", "direction": "OUT" | "IN", "bank": string, "date": "YYYY-MM-DD" | null, "time": "HH:MM" | null, "party": string | null, "account": string | null}',
  "amount: the transferred / paid amount only (not fees, not a balance). Riel (៛, KHR) has no decimals.",
  "direction: OUT if the slip owner sent or paid money (Transfer to, Paid to, Payment), IN if they received it.",
  "bank: the app or bank that issued the slip. date: the transaction date. time: the transaction time, 24-hour (convert AM/PM). party: the recipient (OUT) or sender (IN) name as printed.",
  "account: the slip owner's OWN account number — the account money was paid FROM (OUT) or received INTO (IN), never the other party's. Copy it as printed, keeping masking such as *** or xxx; null if not shown.",
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
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 320, thinkingConfig: { thinkingBudget: 0 } },
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

/** What the slip card shows; kept on the pending entry (action.slip) to redraw it. */
type SlipInfo = { kind: "EXPENSE" | "INCOME"; amount: number; currency: "USD" | "KHR"; bank: string | null; party: string | null; date: string | null; time: string | null }
type Keyboard = { text: string; callback_data: string }[][]

/**
 * The slip card. With a wallet: the category buttons. Without (several could be
 * right): "Which ACLEDA KHR wallet?" and one button per candidate — nothing is
 * booked until the user picks.
 */
function slipCard(lang: Locale, pendingId: string, info: SlipInfo, wallet: BotWallet | null, choices: BotWallet[], rate: number) {
  const walletLine = !wallet
    ? `👛 ${tr(lang, "bot.slipWalletUnsure")}`
    : wallet.currency === info.currency
      ? `👛 ${walletLabel(wallet)}`
      : `👛 ${walletLabel(wallet)} (≈ ${formatMoney(convert(info.amount, info.currency, wallet.currency, rate), wallet.currency)})`
  const lines = [
    tr(lang, "bot.slipTitle", { bank: info.bank ? ` · ${info.bank}` : "" }),
    tr(lang, info.kind === "INCOME" ? "bot.slipIn" : "bot.slipOut"),
    `💵 ${formatMoney(info.amount, info.currency)}`,
    walletLine,
    ...(info.date ? [`📅 ${ddmmyyyy(info.date)}${info.time ? ` ${info.time}` : ""}`] : []),
    ...(info.party ? [`${info.kind === "INCOME" ? "↩️" : "➡️"} ${info.party}`] : []),
    "",
    wallet ? tr(lang, "bot.slipAsk") : tr(lang, "bot.slipWhichWallet", { bank: info.bank ?? "", currency: info.currency }),
  ]
  const keyboard: Keyboard = []
  if (wallet) {
    const buttons = slipChoices(info.kind).map((c, i) => ({ text: tr(lang, c.label), callback_data: `sc:${pendingId}:${i}` }))
    for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2))
  } else {
    choices.forEach((w, i) => keyboard.push([{ text: `👛 ${walletLabel(w)}`, callback_data: `sw:${pendingId}:${i}` }]))
  }
  keyboard.push([{ text: tr(lang, "bot.cancel"), callback_data: `no:${pendingId}` }])
  return { text: maskNumbers(lines.join("\n")), reply_markup: { inline_keyboard: keyboard } }
}

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
  // Never a silent guess: when the account number doesn't settle it, the user picks.
  const pick = resolveWallet(slip, ws.wallets)
  if (!pick) return sendText(chatId, tr(lang, "bot.cmdNoWallet"))
  const wallet = "wallet" in pick ? pick.wallet : null
  const choices = "choices" in pick ? pick.choices : []
  const kind = slip.direction === "IN" ? "INCOME" : "EXPENSE"
  // The payment time: the slip's own, else now when the slip is from today (it was just paid).
  const now = phnomPenhToday()
  const time = slip.time ?? (!slip.date || slip.date === now.day ? `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}` : null)
  const note = ["🧾", slip.bank, slip.party ? `${slip.direction === "IN" ? "←" : "→"} ${slip.party}` : null].filter(Boolean).join(" ").slice(0, 200)
  const info: SlipInfo = { kind, amount: slip.amount, currency: slip.currency, bank: slip.bank, party: slip.party, date: slip.date, time: slip.time }
  const action = {
    kind,
    // Unsure: a placeholder that bot_confirm refuses (wallet_pending) until one of wallet_choices is picked.
    wallet_id: wallet?.id ?? choices[0].id,
    ...(wallet ? {} : { wallet_pending: true, wallet_choices: choices.map((w) => w.id) }),
    slip: info,
    category_id: null,
    amount: slip.amount,
    currency: slip.currency,
    note,
    // With its time, so the entry sorts and reads as when it was paid.
    date: slip.date && slip.time ? `${slip.date}T${slip.time}:00+07:00` : slip.date,
    receipt: fileId,
    meal: kind === "EXPENSE" ? mealFor(time, slip.party) : null,
    text: note,
    heard: null,
  }
  const { data: pendingId, error } = await botDb().rpc("bot_propose", { p_key: botKey(), p_chat_id: chatId, p_action: action })
  if (error || typeof pendingId !== "string") return sendText(chatId, tr(lang, "bot.saveFailed"))

  const card = slipCard(lang, pendingId, info, wallet, choices, ws.rate)
  return sendText(chatId, card.text, { reply_markup: card.reply_markup })
}

// sw:<pending>:<i> picks the wallet when unsure; sc:<pending>:<choice> saves a slip;
// st:<transaction>:<b|l|d|s|N|W> re-tags it from the saved card.
export const isSlipCallback = (data: string | undefined) => /^s[wct]:/.test(data ?? "")

type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }
type Pending = {
  kind?: "EXPENSE" | "INCOME"
  workspace_id?: string
  amount?: number
  currency?: "USD" | "KHR"
  wallet_id?: string
  meal?: Meal | null
  slip?: SlipInfo
  wallet_pending?: boolean
  wallet_choices?: string[]
}
type Tagged = {
  amount: number
  currency: "USD" | "KHR"
  /** "ACLEDA KHR · 016***4222" (walletLabel). */
  wallet: string
  /** The category line as shown ("🍲 Food"). */
  label: string
  food: boolean
  subcategory: Meal | null
  need_want: "NEED" | "WANT" | null
}

const MEAL_CODE: Record<Meal, string> = { breakfast: "b", lunch: "l", dinner: "d", snack: "s" }
const MEAL_KEY: Record<Meal, MessageKey> = { breakfast: "bot.meal.breakfast", lunch: "bot.meal.lunch", dinner: "bot.meal.dinner", snack: "bot.meal.snack" }

/** The saved card: what was booked, its meal and Need / Want, and one tap to change either (✓ marks the current one). */
function savedCard(lang: Locale, txId: string, t: Tagged) {
  const text = [
    tr(lang, "bot.slipSaved"),
    `💵 ${formatMoney(Number(t.amount), t.currency)}`,
    `👛 ${t.wallet}`,
    `🏷️ ${t.label}${t.food && t.subcategory ? ` · ${tr(lang, MEAL_KEY[t.subcategory])}` : ""}`,
    ...(t.need_want ? [tr(lang, t.need_want === "NEED" ? "bot.need" : "bot.want")] : []),
  ].join("\n")
  const mark = (on: boolean, label: string) => (on ? `✓ ${label}` : label)
  const keyboard: { text: string; callback_data: string }[][] = []
  if (t.food)
    keyboard.push(MEALS.map((m) => ({ text: mark(t.subcategory === m, tr(lang, MEAL_KEY[m])), callback_data: `st:${txId}:${MEAL_CODE[m]}` })))
  keyboard.push([
    { text: mark(t.need_want === "NEED", tr(lang, "bot.need")), callback_data: `st:${txId}:N` },
    { text: mark(t.need_want === "WANT", tr(lang, "bot.want")), callback_data: `st:${txId}:W` },
  ])
  return { text: maskNumbers(text), reply_markup: { inline_keyboard: keyboard } }
}

async function tagTransaction(chatId: number, txId: string, meal: Meal | null, needWant: "NEED" | "WANT" | null) {
  const { data, error } = await botDb().rpc("bot_tx_tag", { p_key: botKey(), p_chat_id: chatId, p_tx_id: txId, p_subcategory: meal, p_need_want: needWant })
  return { data: data as ({ ok?: boolean; category?: string | null; preset?: string | null; account_no?: string | null } & Partial<Tagged>) | null, error }
}

/** A category button under a slip card: save with that category, then show the result on the card. */
export async function handleSlipCallback(cb: Callback) {
  if (cb.data?.startsWith("st:")) return handleTagCallback(cb)
  if (cb.data?.startsWith("sw:")) return handleWalletCallback(cb)
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
    const why = /plan_required/.test(msg)
      ? "bot.cmdPro"
      : /commands_off/.test(msg)
        ? "bot.cmdOff"
        : /not_writable/.test(msg)
          ? "bot.cmdReadonly"
          : /wallet_unresolved/.test(msg)
            ? "bot.slipPickWalletFirst"
            : "bot.saveFailed"
    return answer(tr(lang, why), true)
  }
  const r = result as { ok?: boolean; wallet?: string; tx_id?: string } | null
  if (!r?.ok) return answer(tr(lang, "bot.expired"), true)

  await answer(tr(lang, "bot.slipSaved"))
  // Food: the meal from the payment time (☕ is always a snack); the card lets the user change it.
  const food = isFoodChoice(choice)
  const meal: Meal | null = food ? (choice.tag ? "snack" : (action.meal ?? null)) : null
  if (meal && r.tx_id) await tagTransaction(chatId, r.tx_id, meal, null)
  const booked = ws?.wallets.find((w) => w.id === action.wallet_id)
  const tagged: Tagged = { amount: Number(action.amount), currency: action.currency ?? "USD", wallet: booked ? walletLabel(booked) : (r.wallet ?? ""), label, food, subcategory: meal, need_want: null }
  const card =
    r.tx_id && action.kind === "EXPENSE"
      ? savedCard(lang, r.tx_id, tagged)
      : { text: maskNumbers([tr(lang, "bot.slipSaved"), `💵 ${formatMoney(tagged.amount, tagged.currency)}`, `👛 ${tagged.wallet}`, `🏷️ ${label}`].join("\n")) }
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, ...card })
}

/** A "which wallet?" button: set that wallet on the pending slip, then show the category buttons. */
async function handleWalletCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const [, pendingId, index] = (cb.data ?? "").split(":", 3)
  const chatId = cb.message?.chat.id
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(pendingId ?? "") || !/^\d$/.test(index ?? "")) return answer()
  const ctx = await botContext(chatId)
  const lang: Locale = contextLocale(ctx)
  if (!ctx?.linked) return answer(tr(lang, "bot.notLinked"), true)

  const { data } = await botDb().rpc("bot_pending", { p_key: botKey(), p_chat_id: chatId, p_pending_id: pendingId })
  const pending = data as Pending | null
  const walletId = pending?.wallet_choices?.[Number(index)]
  if (!pending?.kind || !pending.slip || !walletId) return answer(tr(lang, "bot.expired"), true)
  const { data: set, error } = await botDb().rpc("bot_pending_wallet", { p_key: botKey(), p_chat_id: chatId, p_pending_id: pendingId, p_wallet_id: walletId })
  if (error || !(set as { ok?: boolean } | null)?.ok) return answer(tr(lang, error ? "bot.saveFailed" : "bot.expired"), true)

  const ws = workspacesOf(ctx).find((w) => w.id === pending.workspace_id)
  const wallet = ws?.wallets.find((w) => w.id === walletId)
  if (!ws || !wallet) return answer(tr(lang, "bot.saveFailed"), true)
  await answer(walletLabel(wallet))
  const card = slipCard(lang, pendingId, pending.slip, wallet, [], ws.rate)
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, ...card }).catch(() => null)
}

const TAG_CODES: Record<string, { meal?: Meal; needWant?: "NEED" | "WANT" }> = {
  b: { meal: "breakfast" },
  l: { meal: "lunch" },
  d: { meal: "dinner" },
  s: { meal: "snack" },
  N: { needWant: "NEED" },
  W: { needWant: "WANT" },
}

/** A meal or Need / Want button under a saved slip: update that entry in place, nothing re-entered. */
async function handleTagCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const [, txId, code] = (cb.data ?? "").split(":", 3)
  const chatId = cb.message?.chat.id
  const tag = TAG_CODES[code ?? ""]
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(txId ?? "") || !tag) return answer()
  const ctx = await botContext(chatId)
  const lang: Locale = contextLocale(ctx)
  if (!ctx?.linked) return answer(tr(lang, "bot.notLinked"), true)

  const { data, error } = await tagTransaction(chatId, txId, tag.meal ?? null, tag.needWant ?? null)
  if (error) {
    const msg = error.message ?? ""
    const why = /plan_required/.test(msg) ? "bot.cmdPro" : /commands_off/.test(msg) ? "bot.cmdOff" : /not_writable/.test(msg) ? "bot.cmdReadonly" : "bot.saveFailed"
    return answer(tr(lang, why), true)
  }
  if (!data?.ok) return answer(tr(lang, "bot.expired"), true)
  await answer(tag.meal ? tr(lang, MEAL_KEY[tag.meal]) : tr(lang, tag.needWant === "NEED" ? "bot.need" : "bot.want"))
  const food = data.preset === "food"
  const label = data.category ? `${food ? "🍲 " : ""}${categoryLabel({ name: data.category, preset_key: data.preset ?? null }, lang)}` : tr(lang, "entry.uncategorized")
  const card = savedCard(lang, txId, {
    amount: Number(data.amount),
    currency: data.currency ?? "USD",
    wallet: walletLabel({ name: data.wallet ?? "", account_no: data.account_no ?? null }),
    label,
    food,
    subcategory: data.subcategory ?? null,
    need_want: data.need_want ?? null,
  })
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, ...card }).catch(() => null)
}

/** Webhook entry: a private photo from a linked chat. */
export async function handlePrivatePhoto(chatId: number, fileId: string) {
  const ctx = await botContext(chatId)
  return handleSlipPhoto(chatId, fileId, ctx)
}
