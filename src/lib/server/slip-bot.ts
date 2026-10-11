// Server only: a bank slip photo in the private chat → Gemini Vision reads the
// amount, currency, bank and date → a card with one-tap category buttons →
// one tap saves it (with the slip's date and time, and the photo kept as the receipt).
// The saved card then offers the meal (food, guessed from the time) and Need / Want.
// Zero-click (founder, 09/10): when the payee is one the user has categorised before, or an
// unmistakable café / restaurant / fuel station / mart, and the wallet is certain, the slip is
// saved at once with [🍲 ប្តូរជាម្ហូបអាហារ] [🔄 ប្រភេទផ្សេង] [🗑️ លុប] — every choice is learned.
//
// Privacy: only the slip photo goes to Gemini (the same server key as voice
// notes) — or, while Gemini is overloaded, to Groq's vision model (Groq already
// transcribes voice notes); wallets and categories are matched here. The card is plain text and
// passes through maskNumbers (account numbers on the slip never echo back).
import { DEFAULT_ABOUT } from "@/lib/app-site"
import { categoryFor, cleanSlip, isFoodChoice, mealFor, resolveWallet, slipChoices, SLIP_OUT, walletLabel, type Meal, type Slip, type SlipChoice } from "@/lib/bot/bank-slip"
import { autoDecision, choiceIndex, choiceKey, merchantKey, type Remembered } from "@/lib/bot/slip-auto"
import type { BotCategory } from "@/lib/bot/parse-entry"
import { categoryLabel } from "@/lib/categories/presets"
import { handleBillPhoto, settleBillFromPayment } from "@/lib/server/bill-bot"
import { handleLoanSchedulePhoto } from "@/lib/server/loan-schedule-bot"
import { handleTermDepositPhoto } from "@/lib/server/term-deposit-bot"
import type { BotWallet } from "@/lib/bot/parse-entry"
import { defaultNeedWant } from "@/lib/need-want"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { convert, formatMoney } from "@/lib/money"
import { blocked, botContext, contextLocale, handleEntryMessage, logEvHome, workspacesOf, type Context } from "@/lib/server/bot-commands"
import { parseAmountText } from "@/lib/bot/parse-entry"
import { photoRoute } from "@/lib/bot/photo-route"
import { MEAL_KEY, cleanNote, savedCard, tagTransaction, taggedFrom, type Tagged, type TaggedRow } from "@/lib/server/entry-card"
import { logEvent } from "@/lib/server/events"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, maskNumbers, sendText, telegramFile, tg, tr } from "@/lib/server/telegram-bot"

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
// The fallback reader while Gemini is overloaded (503s / no answer): fast, good on Latin print, weak on Khmer script.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_VISION = "qwen/qwen3.8-27b"
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
  "This photo should be a Cambodian bank receipt (ACLEDA, ABA, Wing, Bakong / KHQR, Canadia, Prince, etc.), possibly a phone screenshot:",
  "a transfer, a KHQR / merchant payment, a card / POS purchase (ABA \"Purchase\" with \"Seller:\", \"Purchase #\", \"APV\", \"Trx. ID\"), OR a bill payment / mobile top-up (Smart, Cellcard, Metfone, EDC, water, internet, PIN-less top-up). All of these are valid slips.",
  "Read it and answer JSON only:",
  '{"is_slip": boolean, "amount": number, "currency": "USD" | "KHR", "direction": "OUT" | "IN", "bank": string, "date": "YYYY-MM-DD" | null, "time": "HH:MM" | null, "party": string | null, "account": string | null, "account_name": string | null, "owner": string | null, "consumer": string | null, "to_account": string | null, "ref": string | null}',
  "amount: the transferred / paid amount only (not fees, not a balance), always positive (drop any minus sign) — \"-5.00 USD\" or \"Original amount: 5.00 USD\" is 5.00. Riel (៛, KHR) has no decimals.",
  "The amount is the large figure at the top of the slip, written with its currency (\"-867,700 KHR\" → 867700 KHR) — even on themed slips with pictures. NEVER take a number from a time (\"11:27 AM\"), a date, a reference or an account number as the amount.",
  "direction: OUT if the slip owner sent or paid money (Transfer to, Paid to, Payment, Purchase, Bill payment, Top-up, a minus sign), IN if they received it.",
  "bank: the app or bank that issued the slip. date: the transaction date. time: the transaction time, 24-hour (convert AM/PM).",
  "party: the recipient (OUT) or sender (IN) name as printed — for a purchase, the Seller / Merchant (\"Seller: HUAT HUAT RESTAURANT BK\" → \"HUAT HUAT RESTAURANT BK\"); for a bill payment or top-up, the biller / service without extras (\"Smart Mobile (PIN-less)\" → \"Smart Mobile\").",
  "account: the slip owner's OWN account number — the account money was paid FROM (OUT) or received INTO (IN), never the other party's. Copy it as printed, keeping masking such as *** or xxx; null if not shown.",
  "account_name: the label printed with that own account, if any (\"DL USD (016 824 222)\" → \"DL USD\"); null when it is just the holder's name (\"From account: SOK DARA (012 345 678)\" → account \"012 345 678\", owner \"SOK DARA\", account_name null).",
  "owner: the slip owner's account holder name as printed (who paid, for OUT; who received, for IN); null if not shown.",
  "consumer: for a bill payment / top-up, the consumer ID or phone number paid for, as printed; null otherwise.",
  "ref: the slip's own transaction ID / reference / hash as printed (\"Trx. ID\", \"Reference #\", \"Hash\", \"លេខយោង\"), e.g. \"000234726282C4VF\"; null if not shown.",
  "to_account: the account or phone number the money went TO (\"To account\", \"ទៅគណនី\", the recipient's number), as printed; null if not shown.",
  'An EV CHARGING SCREEN (a car or charger app — e.g. "MG Marvel R", "Charging complete", "kW·h" / "kWh", a daily energy history) is not a slip: answer {"is_slip": false, "ev_charge": true, "kwh": number, "date": "YYYY-MM-DD" | null} — kwh: the energy charged on the latest (or highlighted) day; date: that day.',
  'A FIXED / TERM DEPOSIT or GOAL SAVING account screen (labels like "Principle Amount", "Maturity Date", "Maturity Amount", "Interest Rate", "Goal Saving Purposes") is not a slip: answer {"is_slip": false, "term_deposit": true}.',
  'A LOAN REPAYMENT SCHEDULE (តារាងកាលវិភាគសងប្រាក់ / "Repayment Schedule": a bank or microfinance table of installments with dates, principal, interest and balance) is not a slip: answer {"is_slip": false, "loan_schedule": true}.',
  'A PAPER UTILITY BILL to be paid (electricity / water: EDC, AKISANI KOUR SROV, PPWSA — an invoice with an amount due and a due date, not a receipt of a payment) is not a slip: answer {"is_slip": false, "utility_bill": true}.',
  'If it is not a bank receipt at all or the amount is unreadable, answer {"is_slip": false}.',
].join("\n")

type ReadResult = { slip: Slip } | { error: "unreadable" | "busy" | "utility_bill" | "loan_schedule" | "term_deposit" } | { error: "ev_charge"; kwh: number; date: string | null }

export type Answer = { text: string } | { fail: string }

/** Gemini Vision's raw answer (retrying brief overloads). */
export async function askGemini(key: string, type: string, image: string, prompt: string = PROMPT, maxTokens = 600): Promise<Answer> {
  const request = () =>
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: type, data: image } }, { text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
  try {
    // Quick 429 / 5xx answers are retried; a request that hangs goes straight to the fallback.
    let res = await request()
    for (const wait of [1500, 4000]) {
      if (res.ok || !(res.status === 429 || res.status >= 500)) break
      await new Promise((resolve) => setTimeout(resolve, wait))
      res = await request()
    }
    if (!res.ok) return { fail: `HTTP ${res.status}` }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    return { text: (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("") }
  } catch (e) {
    return { fail: e instanceof Error && e.name === "TimeoutError" ? "timed out" : "request failed" }
  }
}

export async function askGroq(key: string, type: string, image: string, prompt: string = PROMPT, maxTokens = 600): Promise<Answer> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_VISION,
        temperature: 0,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:${type};base64,${image}` } }, { type: "text", text: prompt }] }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return { fail: `HTTP ${res.status}` }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return { text: body.choices?.[0]?.message?.content ?? "" }
  } catch (e) {
    return { fail: e instanceof Error && e.name === "TimeoutError" ? "timed out" : "request failed" }
  }
}

/**
 * Reads the slip photo: Gemini Vision first; while it is overloaded or doesn't answer, Groq's
 * vision model. Every failure is logged (without the slip's content), so none is invisible.
 */
export async function readSlip(fileId: string): Promise<ReadResult> {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  if (!gemini && !groq) return { error: "busy" }
  const file = await telegramFile(fileId)
  if (!file) return { error: "unreadable" }
  const image = Buffer.from(file.bytes).toString("base64")
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image)])
  if (groq) readers.push(["Groq", () => askGroq(groq, file.type, image)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "slips", `Slip read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    let raw: unknown
    try {
      raw = JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim())
    } catch {
      logEvent("warn", "slips", `Slip read: ${name} answered without JSON`, { fold: true })
      continue
    }
    // A paper electricity / water bill, not a payment: the bill reader takes it (bill-bot.ts).
    if ((raw as { utility_bill?: unknown })?.utility_bill === true) return { error: "utility_bill" }
    // A loan repayment schedule: the loan reader takes it (loan-schedule-bot.ts).
    if ((raw as { loan_schedule?: unknown })?.loan_schedule === true) return { error: "loan_schedule" }
    // A fixed / term deposit: the deposit reader takes it (term-deposit-bot.ts).
    if ((raw as { term_deposit?: unknown })?.term_deposit === true) return { error: "term_deposit" }
    // An EV charging screenshot: its day's kWh goes to the home charging log.
    const ev = raw as { ev_charge?: unknown; kwh?: unknown; date?: unknown }
    if (ev?.ev_charge === true) {
      const kwh = Number(ev.kwh)
      if (Number.isFinite(kwh) && kwh > 0 && kwh <= 500) {
        const date = typeof ev.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? ev.date : null
        return { error: "ev_charge", kwh: Math.round(kwh * 100) / 100, date }
      }
      return { error: "unreadable" }
    }
    const slip = cleanSlip(raw)
    if (slip) return { slip }
    // A definite answer ("not a receipt" / no amount): the photo is the problem, not the reader.
    logEvent("warn", "slips", `Slip not accepted (${name}): ${(raw as { is_slip?: unknown })?.is_slip === false ? "not a bank receipt" : "amount / currency unreadable"}`, { fold: true })
    return { error: "unreadable" }
  }
  // No reader answered: "try again shortly", not "send a clearer photo".
  return { error: "busy" }
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** What the slip card shows; kept on the pending entry (action.slip) to redraw it. */
type SlipInfo = {
  kind: "EXPENSE" | "INCOME"
  amount: number
  currency: "USD" | "KHR"
  bank: string | null
  party: string | null
  date: string | null
  time: string | null
  /** The photo's caption — what was bought / for whom ("ទិញសម្ភារៈសិក្សាឱ្យកូន"). */
  note?: string | null
  /** A bill payment's customer ID / phone number (a recurring bill is settled by it). */
  consumer?: string | null
}
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
    ...(info.note ? [`📝 ${info.note}`] : []),
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
export async function handleSlipPhoto(chatId: number, fileId: string, ctx: Context | null, caption?: string | null) {
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
  if ("error" in read && read.error === "utility_bill") return handleBillPhoto(chatId, fileId, ctx)
  if ("error" in read && read.error === "loan_schedule") return handleLoanSchedulePhoto(chatId, fileId)
  if ("error" in read && read.error === "term_deposit") return handleTermDepositPhoto(chatId, fileId)
  if ("error" in read && read.error === "ev_charge") {
    return sendText(chatId, await logEvHome(chatId, `⚡ ${read.kwh} kWh · screenshot`, lang, { photo: fileId, day: read.date, kwh: read.kwh }))
  }
  // Not a readable slip, but the caption is an entry ("កាហ្វេ 2$"): record it as typed instead of failing.
  if ("error" in read && read.error === "unreadable" && caption && parseAmountText(caption)) return handleEntryMessage(chatId, caption.slice(0, 300), ctx)
  if ("error" in read && read.error === "busy") return sendText(chatId, tr(lang, "bot.slipBusy"))
  // Unreadable: a polite reply, and the manual form one tap away (camera-first, never camera-only).
  if ("error" in read)
    return sendText(chatId, tr(lang, "bot.slipUnreadable"), { reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.manualEntry"), url: `${DEFAULT_ABOUT.website}/transactions` }]] } })
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
  // The caption (what was bought / for whom) first, then the slip's own "🧾 bank → payee".
  const userNote = cleanNote(caption)
  const slipNote = ["🧾", slip.bank, slip.party ? `${slip.direction === "IN" ? "←" : "→"} ${slip.party}` : null, slip.consumer ? `(${slip.consumer})` : null]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200)
  const note = [userNote, slipNote].filter(Boolean).join(" · ")
  const info: SlipInfo = { kind, amount: slip.amount, currency: slip.currency, bank: slip.bank, party: slip.party, date: slip.date, time: slip.time, note: userNote, consumer: slip.consumer ?? null }
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

  // Zero-click: a known payee and a certain wallet → saved now, with override buttons.
  if (wallet && kind === "EXPENSE" && (await autoSaveSlip(chatId, lang, pendingId, ws, wallet, info, action.meal, time))) return
  // An unknown payee: saved now all the same (nothing is lost if no one taps), flagged
  // "⚠️ ខ្វះព័ត៌មានចំណាយ" with the six categories; a tap fills it in (and is learned).
  if (wallet && kind === "EXPENSE" && (await saveWithoutCategory(chatId, lang, pendingId, wallet, info))) return

  const card = slipCard(lang, pendingId, info, wallet, choices, ws.rate)
  return sendText(chatId, card.text, { reply_markup: card.reply_markup })
}

/** Tags that ride on a note ("☕ កាហ្វេ/ភេសជ្ជៈ · …"), in every language — taken off when the category changes. */
const NOTE_TAGS = SLIP_OUT.filter((c) => c.tag).flatMap((c) => (["km", "en", "zh"] as Locale[]).map((l) => tr(l, c.label as MessageKey)))

/** The category a choice means in this workspace (the user's remembered one wins). */
function categoryOf(choice: SlipChoice | null, ws: { categories: BotCategory[] }, rememberedId?: string): BotCategory | null {
  if (rememberedId) return ws.categories.find((c) => c.id === rememberedId && c.type === "EXPENSE") ?? null
  return choice ? categoryFor(choice, "EXPENSE", ws.categories) : null
}

/**
 * Zero-click save of a slip whose payee is known (memory, else payee rules). False = not
 * sure (or the save failed): the usual card with category buttons is shown instead.
 */
async function autoSaveSlip(
  chatId: number,
  lang: Locale,
  pendingId: string,
  ws: { id: string; categories: BotCategory[] },
  wallet: BotWallet,
  info: SlipInfo,
  slipMeal: Meal | null,
  time: string | null,
): Promise<boolean> {
  const key = merchantKey(info.party)
  const recalled = key ? ((await botDb().rpc("bot_merchant_recall", { p_key: botKey(), p_chat_id: chatId, p_merchant: key, p_workspace_id: ws.id })).data as Remembered | null) : null
  const decision = autoDecision(info.party, time, recalled)
  if (!decision) return false
  const key2 = decision.source === "memory" ? decision.remembered.choice : decision.choice
  const choice = key2 && choiceIndex(key2) >= 0 ? SLIP_OUT[choiceIndex(key2)] : null
  const category = categoryOf(choice, ws, decision.source === "memory" ? decision.remembered.category_id : undefined)
  if (!category) return false
  const label = choice ? tr(lang, choice.label as MessageKey) : categoryLabel(category, lang)
  const { data: result, error } = await botDb().rpc("bot_confirm_category", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_pending_id: pendingId,
    p_category_id: category.id,
    p_note_tag: choice?.tag ? label : null,
  })
  const r = result as { ok?: boolean; tx_id?: string } | null
  if (error || !r?.ok || !r.tx_id) return false

  const food = choice ? isFoodChoice(choice) : category.preset_key === "food"
  const meal: Meal | null = food ? (choice?.tag ? "snack" : slipMeal) : null
  const needWant =
    (decision.source === "memory" ? decision.remembered.need_want : null) ??
    defaultNeedWant({ preset: category.preset_key, meal, text: [label, info.party, info.note].filter(Boolean).join(" ") })
  if (meal || needWant) await tagTransaction(chatId, r.tx_id, meal, needWant)
  // Learned from the rules too: next time it's the user's own habit (and an override replaces it).
  if (key) await botDb().rpc("bot_merchant_learn", { p_key: botKey(), p_chat_id: chatId, p_merchant: key, p_category_id: category.id, p_choice: key2 ?? null, p_need_want: needWant })

  const card = autoCard(lang, r.tx_id, { amount: info.amount, currency: info.currency, label, needWant, wallet: walletLabel(wallet), party: info.party, note: info.note ?? null, food })
  await sendText(chatId, card.text, { reply_markup: card.reply_markup })
  logEvent("info", "slips", `Slip saved without a tap (${decision.source === "memory" ? "user's habit" : "payee rule"})`, { fold: true })
  await settleBillFromPayment(chatId, r.tx_id, info.consumer, info.party)
  return true
}

/** The six category buttons under a saved slip (sa:<tx>:c<i>), two per row. */
function categoryRows(lang: Locale, txId: string) {
  const buttons = SLIP_OUT.map((c, i) => ({ text: tr(lang, c.label as MessageKey), callback_data: `sa:${txId}:c${i}` }))
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
  return rows
}

/** Saved with no category: the recorded card, "⚠️ ខ្វះព័ត៌មានចំណាយ ៖ សូមជ្រើសរើសប្រភេទ" and the categories. */
async function saveWithoutCategory(chatId: number, lang: Locale, pendingId: string, wallet: BotWallet, info: SlipInfo): Promise<boolean> {
  const { data: result, error } = await botDb().rpc("bot_confirm", { p_key: botKey(), p_chat_id: chatId, p_pending_id: pendingId })
  const r = result as { ok?: boolean; tx_id?: string } | null
  if (error || !r?.ok || !r.tx_id) return false
  const text = [
    `✅ ${tr(lang, "bot.autoSaved")} ${formatMoney(info.amount, info.currency)} ${tr(lang, "bot.savedToWallet")}`,
    `👛 ${walletLabel(wallet)}`,
    ...(info.party ? [`📍 ${info.party}`] : []),
    ...(info.note ? [`📝 ${info.note}`] : []),
    "",
    tr(lang, "bot.missingCategory"),
  ].join("\n")
  const rows = categoryRows(lang, r.tx_id)
  rows.push([{ text: tr(lang, "bot.autoDelete"), callback_data: `sa:${r.tx_id}:x` }])
  await sendText(chatId, maskNumbers(text), { reply_markup: { inline_keyboard: rows } })
  logEvent("info", "slips", "Slip saved without a category (asked to pick one)", { fold: true })
  await settleBillFromPayment(chatId, r.tx_id, info.consumer, info.party)
  return true
}

/**
 * ✅ បានកត់ត្រា 11,500៛ (☕ កាហ្វេ/ភេសជ្ជៈ · ✨ ចំណង់)
 * 👛 អេស៊ីលីដា •••• 4222 KHR
 * 📍 360 DEGREE COFFEE
 * [🍲 ប្តូរជាម្ហូបអាហារ] [🔄 ប្រភេទផ្សេង] [🗑️ លុប]
 */
function autoCard(
  lang: Locale,
  txId: string,
  t: { amount: number; currency: "USD" | "KHR"; label: string; needWant: "NEED" | "WANT" | null; wallet: string; party: string | null; note: string | null; food: boolean },
) {
  const nw = t.needWant ? ` · ${tr(lang, t.needWant === "NEED" ? "bot.need" : "bot.want")}` : ""
  const text = [
    `✅ ${tr(lang, "bot.autoSaved")} ${formatMoney(t.amount, t.currency)} (${t.label}${nw})`,
    `👛 ${t.wallet}`,
    ...(t.party ? [`📍 ${t.party}`] : []),
    ...(t.note ? [`📝 ${t.note}`] : []),
  ].join("\n")
  const row = [
    ...(t.food ? [] : [{ text: tr(lang, "bot.autoToFood"), callback_data: `sa:${txId}:f` }]),
    { text: tr(lang, "bot.autoOther"), callback_data: `sa:${txId}:o` },
    { text: tr(lang, "bot.autoDelete"), callback_data: `sa:${txId}:x` },
  ]
  return { text: maskNumbers(text), reply_markup: { inline_keyboard: [row] } }
}

/** sa:<tx>:f (to food) · o (show categories) · c<i> (that category) · x (delete) — on a zero-click card. */
async function handleAutoCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const [, txId, op] = (cb.data ?? "").split(":", 3)
  const chatId = cb.message?.chat.id
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(txId ?? "") || !/^(f|o|x|c\d)$/.test(op ?? "")) return answer()
  const ctx = await botContext(chatId)
  const lang: Locale = contextLocale(ctx)
  if (!ctx?.linked) return answer(tr(lang, "bot.notLinked"), true)
  const edit = (text: string, reply_markup?: unknown) =>
    tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(text), ...(reply_markup ? { reply_markup } : {}) }).catch(() => null)

  if (op === "x") {
    const { data, error } = await botDb().rpc("bot_slip_delete", { p_key: botKey(), p_chat_id: chatId, p_tx_id: txId })
    const r = data as { ok?: boolean; amount?: number; currency?: "USD" | "KHR" } | null
    if (error || !r?.ok) return answer(tr(lang, error ? "bot.saveFailed" : "bot.expired"), true)
    await answer(tr(lang, "bot.autoDeleted"))
    return edit(`🗑️ ${tr(lang, "bot.autoDeleted")} ${formatMoney(Number(r.amount), r.currency ?? "USD")}`)
  }
  if (op === "o") {
    // The category buttons, in place of the overrides (plus delete).
    const keyboard = categoryRows(lang, txId) as { text: string; callback_data: string }[][]
    keyboard.push([{ text: tr(lang, "bot.autoDelete"), callback_data: `sa:${txId}:x` }])
    await answer()
    return tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: keyboard } }).catch(() => null)
  }

  const choice = op === "f" ? SLIP_OUT[choiceIndex("food")] : SLIP_OUT[Number(op.slice(1))]
  const ws = workspacesOf(ctx)[0]
  const category = choice ? categoryOf(choice, ws) : null
  if (!choice || !category) return answer(tr(lang, "bot.saveFailed"), true)
  const label = tr(lang, choice.label as MessageKey)
  const food = isFoodChoice(choice)
  const needWant = defaultNeedWant({ preset: category.preset_key, meal: food ? "lunch" : null, text: label })
  const { data, error } = await botDb().rpc("bot_slip_recategorize", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_tx_id: txId,
    p_category_id: category.id,
    p_note_tag: choice.tag ? label : null,
    p_strip_tags: NOTE_TAGS,
    p_subcategory: food ? (choice.tag ? "snack" : "auto") : null,
    p_need_want: needWant,
    p_choice: choiceKey(choice.label),
  })
  const r = data as { ok?: boolean; merchant?: string | null } | null
  if (error || !r?.ok) return answer(tr(lang, error ? "bot.saveFailed" : "bot.expired"), true)
  await answer(tr(lang, "bot.autoLearned"))
  // The card says what it is now; the overrides stay (another change is one tap away).
  const old = (cb.message as { text?: string } | undefined)?.text ?? ""
  // The "⚠️ ខ្វះព័ត៌មានចំណាយ" line (and the blank line above it) goes once a category is set.
  const rest = old
    .split("\n")
    .slice(1)
    .filter((l) => !l.startsWith("⚠️"))
    .join("\n")
    .trim()
  const nw = needWant ? ` · ${tr(lang, needWant === "NEED" ? "bot.need" : "bot.want")}` : ""
  const first = old.split("\n")[0] ?? ""
  const amount = /\([^)]*\)\s*$/.test(first) ? first.replace(/\([^)]*\)\s*$/, `(${label}${nw})`) : `${first} (${label}${nw})`
  const row = [
    ...(food ? [] : [{ text: tr(lang, "bot.autoToFood"), callback_data: `sa:${txId}:f` }]),
    { text: tr(lang, "bot.autoOther"), callback_data: `sa:${txId}:o` },
    { text: tr(lang, "bot.autoDelete"), callback_data: `sa:${txId}:x` },
  ]
  return edit([amount, rest].filter(Boolean).join("\n"), { inline_keyboard: [row] })
}

// sw:<pending>:<i> picks the wallet when unsure; sc:<pending>:<choice> saves a slip;
// st:<transaction>:<b|l|d|s|N|W> re-tags it from the saved card; sa:<transaction>:… overrides a zero-click save.
export const isSlipCallback = (data: string | undefined) => /^s[wcta]:/.test(data ?? "")

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

/** A category button under a slip card: save with that category, then show the result on the card. */
export async function handleSlipCallback(cb: Callback) {
  if (cb.data?.startsWith("st:")) return handleTagCallback(cb)
  if (cb.data?.startsWith("sa:")) return handleAutoCallback(cb)
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
  // Need vs Want pre-selected (meals, fuel, rent… are needs; coffee, entertainment… wants); one tap switches it.
  const needWant = action.kind === "EXPENSE" ? defaultNeedWant({ preset: category.preset_key, meal, text: [action.slip?.party, action.slip?.note].filter(Boolean).join(" ") }) : null
  if ((meal || needWant) && r.tx_id) await tagTransaction(chatId, r.tx_id, meal, needWant)
  // A tap teaches the bot: next time this payee is saved without asking.
  const merchant = merchantKey(action.slip?.party)
  if (merchant && action.kind === "EXPENSE")
    await botDb().rpc("bot_merchant_learn", { p_key: botKey(), p_chat_id: chatId, p_merchant: merchant, p_category_id: category.id, p_choice: choiceKey(choice.label), p_need_want: needWant })
  const booked = ws?.wallets.find((w) => w.id === action.wallet_id)
  const tagged: Tagged = {
    amount: Number(action.amount),
    currency: action.currency ?? "USD",
    wallet: booked ? walletLabel(booked) : (r.wallet ?? ""),
    label,
    food,
    subcategory: meal,
    need_want: needWant,
    note: action.slip?.note ?? null,
  }
  const card =
    r.tx_id && action.kind === "EXPENSE"
      ? savedCard(lang, r.tx_id, tagged)
      : { text: maskNumbers([tr(lang, "bot.slipSaved"), `💵 ${formatMoney(tagged.amount, tagged.currency)}`, `👛 ${tagged.wallet}`, `🏷️ ${label}`].join("\n")) }
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, ...card })
  if (action.kind === "EXPENSE") await settleBillFromPayment(chatId, r.tx_id, action.slip?.consumer, action.slip?.party)
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

const TAG_CODES: Record<string, { meal?: Meal; needWant?: "NEED" | "WANT"; forChild?: boolean }> = {
  K1: { forChild: true },
  K0: { forChild: false },
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
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(txId ?? "") || (!tag && code !== "T")) return answer()
  const ctx = await botContext(chatId)
  const lang: Locale = contextLocale(ctx)
  if (!ctx?.linked) return answer(tr(lang, "bot.notLinked"), true)
  if (code === "T") return askForNote(chatId, txId, cb.message!.message_id, lang, answer)

  const { data, error } = await tagTransaction(chatId, txId, tag.meal ?? null, tag.needWant ?? null, tag.forChild ?? null)
  if (error) {
    const msg = error.message ?? ""
    const why = /plan_required/.test(msg) ? "bot.cmdPro" : /commands_off/.test(msg) ? "bot.cmdOff" : /not_writable/.test(msg) ? "bot.cmdReadonly" : "bot.saveFailed"
    return answer(tr(lang, why), true)
  }
  if (!data?.ok) return answer(tr(lang, "bot.expired"), true)
  await answer(
    tag.meal ? tr(lang, MEAL_KEY[tag.meal]) : tag.forChild !== undefined ? tr(lang, tag.forChild ? "bot.forChildOn" : "bot.forChild") : tr(lang, tag.needWant === "NEED" ? "bot.need" : "bot.want"),
  )
  const card = savedCard(lang, txId, taggedFrom(lang, data as TaggedRow))
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, ...card }).catch(() => null)
}

/** [📝 បន្ថែមចំណាំ]: a prompt to reply to (text or voice); the reply becomes the entry's note. */
async function askForNote(chatId: number, txId: string, cardMsg: number, lang: Locale, answer: (text?: string, alert?: boolean) => unknown) {
  const sent = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: tr(lang, "bot.notePrompt"),
    reply_to_message_id: cardMsg,
    reply_markup: { force_reply: true, input_field_placeholder: tr(lang, "bot.notePlaceholder") },
  })
  if (!sent.ok || !sent.result) return answer(tr(lang, "bot.saveFailed"), true)
  const { data, error } = await botDb().rpc("bot_note_prompt_set", { p_key: botKey(), p_chat_id: chatId, p_message_id: sent.result.message_id, p_tx_id: txId, p_card_msg: cardMsg })
  if (error || data !== true) {
    await tg("deleteMessage", { chat_id: chatId, message_id: sent.result.message_id }).catch(() => null)
    const why = /plan_required/.test(error?.message ?? "") ? "bot.cmdPro" : /commands_off/.test(error?.message ?? "") ? "bot.cmdOff" : "bot.expired"
    return answer(tr(lang, why), true)
  }
  return answer()
}

/**
 * A reply (typed, or a voice note already turned into text) to a note prompt:
 * set the note, acknowledge, and redraw the saved card. False when the replied-to
 * message isn't a note prompt — the message is then handled as usual.
 */
export async function handleNoteReply(chatId: number, replyTo: number, text: string): Promise<boolean> {
  const note = cleanNote(text)
  if (!note) return false
  const { data, error } = await botDb().rpc("bot_tx_note", { p_key: botKey(), p_chat_id: chatId, p_prompt_message_id: replyTo, p_note: note })
  if (!error && data === null) return false
  const lang = contextLocale(await botContext(chatId))
  const r = data as ({ ok?: boolean; tx_id?: string; card_msg?: number | null; user_note?: string; type?: string } & TaggedRow) | null
  if (error || !r?.ok) {
    const msg = error?.message ?? ""
    const why = /plan_required/.test(msg) ? "bot.cmdPro" : /commands_off/.test(msg) ? "bot.cmdOff" : /not_writable/.test(msg) ? "bot.cmdReadonly" : error ? "bot.saveFailed" : "bot.expired"
    await sendText(chatId, tr(lang, why))
    return true
  }
  await sendText(chatId, maskNumbers(tr(lang, "bot.noteSaved", { note: r.user_note ?? note })))
  if (r.card_msg && r.tx_id && r.type === "EXPENSE") {
    const card = savedCard(lang, r.tx_id, taggedFrom(lang, r))
    await tg("editMessageText", { chat_id: chatId, message_id: r.card_msg, ...card }).catch(() => null)
  }
  return true
}

/** Webhook entry: a private photo from a linked chat (its caption becomes the note). */
/**
 * Every photo gets an answer — never silence: whatever goes wrong while reading it (a reader, the
 * network, a bug), the polite «can't read this» reply with the manual-entry button still goes out.
 */
export async function handlePrivatePhoto(chatId: number, fileId: string, caption?: string | null) {
  try {
    return await routePrivatePhoto(chatId, fileId, caption)
  } catch (e) {
    logEvent("error", "slips", `Photo handling failed: ${(e as Error).message}`, { fold: true })
    const ctx = await botContext(chatId).catch(() => null)
    return sendText(chatId, tr(contextLocale(ctx), "bot.slipUnreadable"), { reply_markup: { inline_keyboard: [[{ text: tr(contextLocale(ctx), "bot.manualEntry"), url: `${DEFAULT_ABOUT.website}/transactions` }]] } })
  }
}

async function routePrivatePhoto(chatId: number, fileId: string, caption?: string | null) {
  const ctx = await botContext(chatId)
  // The human first: a caption says what the photo is for, so it is followed before the picture is
  // read — the photo is then its evidence. Never "can't read this slip" for a clear caption.
  const route = photoRoute(caption)
  if (route !== "slip" && caption) {
    const lang = contextLocale(ctx)
    if (!ctx?.linked) return sendText(chatId, tr(lang, "bot.notLinked"))
    // Home charging: logged now. An entry ("កាហ្វេ 2$"): its ✅ card, with the photo as the receipt.
    if (route === "loan") {
      const stop = blocked(ctx, lang)
      if (stop) return sendText(chatId, stop)
      return handleLoanSchedulePhoto(chatId, fileId)
    }
    if (route === "ev") {
      const stop = blocked(ctx, lang)
      if (stop) return sendText(chatId, stop)
      return sendText(chatId, await logEvHome(chatId, caption, lang, { photo: fileId }))
    }
    return handleEntryMessage(chatId, caption.slice(0, 300), ctx, undefined, fileId)
  }
  return handleSlipPhoto(chatId, fileId, ctx, caption)
}
