// Server only: chat logging for the official bot (Phase C part 2).
import { khmerWordsToDigits } from "@/lib/bot/khmer-numbers"
import { marketQueryReply, parseMarketQuery } from "@/lib/bot/market-query"
import { carReportText, parseTopUp, topUpCard, walletBalancesText, type CarReport, type WalletBalance } from "@/lib/bot/prepaid"
import { isEvUsage } from "@/lib/bot/photo-route"
import { kwhOf, parseEntry, type BotCategory, type BotDebt, type BotWallet, type ParsedEntry } from "@/lib/bot/parse-entry"
import { routeWorkspace } from "@/lib/bot/route-workspace"
import { mealFor, type Meal } from "@/lib/bot/bank-slip"
import type { Locale } from "@/lib/i18n/dictionaries"
import { defaultNeedWant } from "@/lib/need-want"
import { MEAL_KEY, savedCard, tagTransaction, taggedFrom, type TaggedRow } from "@/lib/server/entry-card"
import { DEFAULT_ABOUT } from "@/lib/app-info"
import { convert, formatMoney } from "@/lib/money"
import { currentMarket, phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, botToken, maskNumbers, sendText, tg, tr } from "@/lib/server/telegram-bot"
import { transcribe, transcriptionProvider } from "@/lib/server/transcribe"
import { asksWhoOwesMe, handleAiQuestion, isAiQuestion } from "@/lib/server/ai-bot"

/**
 * A text message from a linked chat becomes a confirmation card; nothing is
 * saved until ✅. The database re-checks everything on ✅ (link, opt-in, plan,
 * write access, ids in the workspace), so the server only proposes.
 *   FREE   reminders only (chat logging answers with the PRO prompt)
 *   PRO    one workspace, chosen in Settings › Telegram
 *   ULTRA  optionally every workspace: routed by name / tag, switchable on the card
 */

type Workspace = {
  id: string
  name: string
  type: "PERSONAL" | "BUSINESS" | "FAMILY"
  rate: number
  wallets: BotWallet[]
  categories: BotCategory[]
  debts: BotDebt[]
}

export type Context = {
  linked: boolean
  pro?: boolean
  /** ULTRA plan, and ULTRA with "log into all workspaces" on. */
  ultra?: boolean
  route_all?: boolean
  enabled?: boolean
  writable?: boolean
  language?: Locale | null
  workspace_id?: string
  workspace_type?: Workspace["type"]
  rate?: number
  wallets?: BotWallet[]
  categories?: BotCategory[]
  debts?: BotDebt[]
  /** Workspaces this chat can log into (one unless routing). */
  workspaces?: Workspace[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function botContext(chatId: number): Promise<Context | null> {
  const { data, error } = await botDb().rpc("bot_context", { p_key: botKey(), p_chat_id: chatId })
  return error ? null : (data as Context)
}

export const contextLocale = (ctx: Context | null): Locale => (ctx?.language === "en" || ctx?.language === "zh" ? ctx.language : "km")

/** ULTRA with "log into all workspaces" on, and more than one to choose from. */
export const isRouting = (ctx: Context | null) => Boolean(ctx?.route_all && (ctx.workspaces?.length ?? 0) > 1)

/** Why this chat can't log right now (PRO, opt-in, write access), or null. */
export function blocked(ctx: Context, lang: Locale) {
  if (!ctx.pro) return tr(lang, "bot.cmdPro")
  if (!ctx.enabled) return tr(lang, "bot.cmdOff")
  if (!ctx.writable) return tr(lang, "bot.cmdReadonly")
  return null
}

/** Workspaces from the context, with numbers as numbers. */
export function workspacesOf(ctx: Context): Workspace[] {
  const list = ctx.workspaces?.length
    ? ctx.workspaces
    : [{ id: ctx.workspace_id ?? "", name: "", type: ctx.workspace_type ?? "PERSONAL", rate: ctx.rate ?? 4000, wallets: ctx.wallets ?? [], categories: ctx.categories ?? [], debts: ctx.debts ?? [] }]
  return list.map((w) => ({
    ...w,
    rate: Number(w.rate) || 4000,
    wallets: w.wallets ?? [],
    categories: w.categories ?? [],
    debts: (w.debts ?? []).map((d) => ({ ...d, remaining: Number(d.remaining) })),
  }))
}

type Parsed = Extract<ParsedEntry, { ok: true }>

/** The reply when a message can't be turned into an entry. */
function failureText(parsed: Extract<ParsedEntry, { ok: false }>, ws: Workspace, lang: Locale) {
  if (parsed.reason === "no_amount") return tr(lang, "bot.cmdNoAmount")
  if (parsed.reason === "no_wallet") return tr(lang, "bot.cmdNoWallet")
  if (parsed.reason === "too_much" && parsed.debt) {
    return tr(lang, "bot.cmdTooMuch", { party: parsed.debt.party_name, remaining: formatMoney(parsed.debt.remaining, parsed.debt.currency) })
  }
  // Names only: amounts owed are shown in the app, not listed in chat.
  const list = ws.debts.map((d) => d.party_name).join(", ")
  return list ? tr(lang, "bot.cmdNoDebt", { list }) : tr(lang, "bot.cmdNoDebts")
}

const WS_ICON: Record<Workspace["type"], string> = { PERSONAL: "👤", BUSINESS: "🏪", FAMILY: "👨‍👩‍👧" }

/** An expense's meal (food: from the time now and the words) and Need / Want default, as for bank slips. */
type EntryTags = { meal: Meal | null; needWant: "NEED" | "WANT" | null }
function entryTags(parsed: Parsed, text: string): EntryTags {
  if (parsed.kind !== "EXPENSE") return { meal: null, needWant: null }
  const preset = parsed.category?.preset_key ?? null
  const now = phnomPenhToday()
  const meal = preset === "food" ? mealFor(`${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`, text) : null
  return { meal, needWant: defaultNeedWant({ preset, meal, text }) }
}

/** The confirmation card's text and buttons (with the workspace switcher when routing). */
function card(lang: Locale, parsed: Parsed, ws: Workspace, pendingId: string, opts: { heard?: string; switcher?: Workspace[]; tags?: EntryTags }) {
  const money = formatMoney(parsed.amount, parsed.currency)
  const fromWallet =
    parsed.wallet.currency === parsed.currency
      ? `👛 ${parsed.wallet.name}`
      : `👛 ${parsed.wallet.name} (≈ ${formatMoney(convert(parsed.amount, parsed.currency, parsed.wallet.currency, ws.rate), parsed.wallet.currency)})`
  const lines =
    parsed.kind === "REPAY"
      ? [
          tr(lang, parsed.debt.type === "PAYABLE" ? "bot.cardRepayOut" : "bot.cardRepayIn", { party: parsed.debt.party_name }),
          `💵 ${money}`,
          fromWallet,
          tr(lang, "bot.cardRemaining", { amount: formatMoney(parsed.debt.remaining - parsed.amount, parsed.debt.currency) }),
        ]
      : [
          tr(lang, parsed.kind === "INCOME" ? "bot.cardIncome" : "bot.cardExpense"),
          `💵 ${money}`,
          fromWallet,
          `🏷️ ${parsed.category?.name ?? tr(lang, "bot.cardUncategorized")}${opts.tags?.meal ? ` · ${tr(lang, MEAL_KEY[opts.tags.meal])}` : ""}`,
          ...(opts.tags?.needWant ? [tr(lang, opts.tags.needWant === "NEED" ? "bot.need" : "bot.want")] : []),
        ]
  if (opts.switcher) lines.push(tr(lang, "bot.cardWorkspace", { name: `${WS_ICON[ws.type]} ${ws.name}` }))
  if (opts.heard) lines.unshift(tr(lang, "bot.voiceHeard", { text: opts.heard }))
  else lines.push(`📝 ${parsed.note}`)
  lines.push("", tr(lang, "bot.cardAsk"))

  const keyboard: { text: string; callback_data: string }[][] = []
  if (opts.switcher) {
    const buttons = opts.switcher.map((w) => ({
      text: `${w.id === ws.id ? "✓ " : ""}${WS_ICON[w.type]} ${w.name.length > 18 ? `${w.name.slice(0, 17)}…` : w.name}`,
      callback_data: `w:${pendingId}:${w.id.slice(0, 8)}`,
    }))
    for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2))
  }
  keyboard.push([
    { text: tr(lang, "bot.confirm"), callback_data: `ok:${pendingId}` },
    { text: tr(lang, "bot.cancel"), callback_data: `no:${pendingId}` },
  ])
  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } }
}

/** Saves the proposal in the database (it checks the plan and workspace) and returns its id. */
async function propose(chatId: number, parsed: Parsed, ws: Workspace, extra: { text: string; heard?: string; route: boolean; tags?: EntryTags; receipt?: string }) {
  const base =
    parsed.kind === "REPAY"
      ? { kind: "REPAY", debt_id: parsed.debt.id, wallet_id: parsed.wallet.id, amount: parsed.amount, note: parsed.note }
      : {
          kind: parsed.kind,
          wallet_id: parsed.wallet.id,
          category_id: parsed.category?.id ?? null,
          amount: parsed.amount,
          currency: parsed.currency,
          note: parsed.note,
          // Stored by bot_confirm (expenses): the meal and the Need / Want default.
          subcategory: extra.tags?.meal ?? null,
          need_want: extra.tags?.needWant ?? null,
        }
  // The parsed text (and transcript) are kept so the card can be re-done for another workspace.
  // A photo sent with the entry as its caption: kept as the entry's receipt (bot_confirm stores it).
  const action = { ...base, text: extra.text, heard: extra.heard ?? null, ...(extra.receipt ? { receipt: extra.receipt } : {}), ...(extra.route ? { workspace_id: ws.id } : {}) }
  const { data, error } = await botDb().rpc("bot_propose", { p_key: botKey(), p_chat_id: chatId, p_action: action })
  return error || typeof data !== "string" ? null : data
}

/**
 * Handles a non-command message from a linked chat. `heard` is set for voice
 * notes: the transcript is shown on top of the card (and of any error) so the
 * user can see what was understood. ULTRA chats with routing on go to the
 * workspace named in the message (default Personal) and get a switcher.
 */
export async function handleEntryMessage(chatId: number, text: string, ctx: Context, heard?: string, receipt?: string) {
  const lang = contextLocale(ctx)
  // A spoken question goes to LuyChlat AI (PRO); typed ones are routed in the webhook.
  if (heard && ctx.pro && (isAiQuestion(heard) || asksWhoOwesMe(heard) || asksForBalance(heard))) return handleAiQuestion(chatId, heard, lang)
  if (asksForBalance(heard ?? text)) return sendBalanceLock(chatId, lang)
  // Calculators work for everyone (public rates), before the plan checks.
  const answer = await marketAnswer(text, lang)
  if (answer) return sendText(chatId, (heard ? `${tr(lang, "bot.voiceHeard", { text: heard })}\n` : "") + answer)
  const stop = blocked(ctx, lang)
  if (stop) return sendText(chatId, stop)
  const said = heard ? `${tr(lang, "bot.voiceHeard", { text: heard })}\n` : ""
  const reply = (message: string) => sendText(chatId, said + message)

  const all = workspacesOf(ctx)
  const route = isRouting(ctx)
  const { workspace: ws, text: input } = route ? routeWorkspace(text, all, ctx.workspace_id ?? all[0].id) : { workspace: all[0], text }

  // "ថប់អាប់សាកឡាន 50$ ABA": a transfer into the prepaid wallet (✅ to confirm), not an expense.
  const topUp = parseTopUp(input, ws.wallets)
  if (topUp) {
    if (!topUp.ok) return reply(failureText({ ok: false, reason: topUp.reason }, ws, lang))
    const { data, error } = await botDb().rpc("bot_propose", {
      p_key: botKey(),
      p_chat_id: chatId,
      p_action: { kind: "TOPUP", prepaid: topUp.type, wallet_id: topUp.source.id, amount: topUp.amount, currency: topUp.currency, note: topUp.note, text: input, ...(route ? { workspace_id: ws.id } : {}) },
    })
    if (error || typeof data !== "string") return reply(tr(lang, "bot.saveFailed"))
    return sendText(chatId, said + topUpCard(topUp), {
      reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.confirm"), callback_data: `ok:${data}` }, { text: tr(lang, "bot.cancel"), callback_data: `no:${data}` }]] },
    })
  }

  // EV charging at home: a usage log, never an expense (it's paid in the electricity bill).
  if (isEvUsage(text)) return reply(await logEvHome(chatId, text, lang, receipt ? { photo: receipt } : {}))

  const parsed = parseEntry(input, { wallets: ws.wallets, categories: ws.categories, debts: ws.debts, rate: ws.rate })
  if (!parsed.ok) {
    // A voice note without an amount: say exactly what was heard instead of the general hint.
    if (heard && parsed.reason === "no_amount") return sendText(chatId, tr(lang, "bot.voiceNoAmount", { text: heard }))
    return reply(failureText(parsed, ws, lang))
  }

  const tags = entryTags(parsed, input)
  const pendingId = await propose(chatId, parsed, ws, { text: input, heard, route, tags, receipt })
  if (!pendingId) return reply(tr(lang, "bot.saveFailed"))
  const { text: body, reply_markup } = card(lang, parsed, ws, pendingId, { heard, switcher: route ? all : undefined, tags })
  return sendText(chatId, body, { reply_markup })
}

/*
 * No-data-leak rule: the bot takes entries and sends reminders; it never tells
 * balances, net worth or totals in chat — whoever holds the Telegram account
 * (a lost phone, a hijacked session) would see them. Questions about them get
 * a pointer to the app, which is behind the login (and the App Lock PIN / Face ID).
 */
const BALANCE_QUESTION =
  /^\/(balance|networth|net_worth|summary|total|wallets?)\b|\b(balances?|net ?worth|total (money|assets|savings)|how much (money|do i have|have i got|is (in|left))|my (money|savings|assets))\b|សមតុល្យ|ទ្រព្យសម្បត្តិ|លុយសល់ប៉ុន្មាន|នៅសល់ប៉ុន្មាន|មានលុយប៉ុន្មាន|លុយសរុប|余额|净资产|总资产|多少钱|还剩多少|我的存款|总共有/i

/** A question about balances / net worth, with no amount in it (so not an entry like "balance fix 5"). */
export function asksForBalance(text: string) {
  return BALANCE_QUESTION.test(text.trim()) && !/[\d០-៩]/.test(text)
}

/** "សាកឡាននៅផ្ទះ 30kwh": logs the charge (kWh), not money, and says this month's total. */
export async function logEvHome(chatId: number, text: string, lang: Locale, opts: { photo?: string; day?: string | null; kwh?: number | null } = {}): Promise<string> {
  const kwh = opts.kwh ?? kwhOf(text)
  const { data, error } = await botDb().rpc("bot_log_ev_home", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_kwh: kwh,
    p_note: text.slice(0, 200),
    p_photo: opts.photo ?? null,
    p_day: opts.day ?? null,
  })
  if (error) {
    const msg = error.message ?? ""
    return /plan_required/.test(msg) ? tr(lang, "bot.cmdPro") : /commands_off/.test(msg) ? tr(lang, "bot.cmdOff") : /not_writable/.test(msg) ? tr(lang, "bot.cmdReadonly") : tr(lang, "bot.saveFailed")
  }
  const r = data as { status: string; month_kwh: number; month_count: number }
  const month = tr(lang, "bot.evMonth", { count: r.month_count, total: Number(r.month_kwh) > 0 ? ` · ${Number(r.month_kwh)} kWh` : "" })
  if (r.status === "duplicate") return `${tr(lang, "bot.evDuplicate", { kwh: kwh ?? "" })}\n${month}`
  if (r.status !== "ok") return tr(lang, "bot.help")
  // From a photo (a captioned photo or a car / charger screenshot): the short confirmation.
  if (opts.photo && kwh) return `${tr(lang, "bot.evPhotoLogged", { kwh })}\n${month}`
  return tr(lang, "bot.evHomeLogged", {
    kwh: kwh ? ` · ${kwh} kWh` : "",
    count: r.month_count,
    total: Number(r.month_kwh) > 0 ? ` · ${Number(r.month_kwh)} kWh` : "",
  })
}

type BillAction = { status: "paid" | "snoozed" | "already" | "gone" | "not_linked" | "not_writable"; title?: string; logged?: boolean; wallet?: string | null; amount?: number; currency?: "USD" | "KHR"; next_due?: string; plan_free?: boolean }

/** ✅ / ⏰ under a bill reminder: mark paid (logging the expense on paid plans) or remind tomorrow. */
async function billAction(cb: Callback, chatId: number, verb: "bp" | "bs", billId: string, due: string | undefined) {
  const ctx = await botContext(chatId)
  const lang = contextLocale(ctx)
  const { data, error } = await botDb().rpc("bot_bill_action", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_bill_id: billId,
    p_action: verb === "bp" ? "paid" : "snooze",
    p_due: verb === "bp" && due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
  })
  const r = data as BillAction | null
  const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  const outcome =
    error || !r
      ? tr(lang, "bot.saveFailed")
      : r.status === "paid"
        ? [
            tr(lang, "bot.billPaid", { next: r.next_due ? ddmmyyyy(r.next_due) : "—" }),
            r.logged ? tr(lang, "bot.billLogged", { amount: formatMoney(Number(r.amount), r.currency ?? "USD"), wallet: r.wallet ?? "" }) : r.plan_free ? tr(lang, "bot.billNotLoggedFree") : tr(lang, "bot.billNoWallet"),
          ].join("\n")
        : r.status === "snoozed"
          ? tr(lang, "bot.billSnoozed")
          : r.status === "already"
            ? tr(lang, "bot.billAlready", { next: r.next_due ? ddmmyyyy(r.next_due) : "—" })
            : r.status === "not_writable"
              ? tr(lang, "bot.cmdReadonly")
              : tr(lang, "bot.billGone")
  await tg("answerCallbackQuery", { callback_query_id: cb.id })
  // Keep the reminder, drop its buttons, add what happened.
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(`${cb.message?.text ?? ""}\n\n${outcome}`).slice(0, 4000) })
}

/** /rate, /gold and plain calculator questions ("100$ to khr", "មាស ២ ជី"): the reply, or null. */
export async function marketAnswer(text: string, lang: Locale): Promise<string | null> {
  const query = parseMarketQuery(text)
  if (!query) return null
  return marketQueryReply(query, await currentMarket(), lang, phnomPenhToday().day, (key, params) => tr(lang, key, params))
}

async function sendBalanceLock(chatId: number, lang: Locale) {
  // Opted in («ឱ្យ AI មើលលេខរបស់ខ្ញុំ», off by default — the same switch as the AI's numbers): the balances.
  const { data } = await botDb().rpc("bot_wallet_balances", { p_key: botKey(), p_chat_id: chatId })
  const r = data as { status: string; wallets?: WalletBalance[] } | null
  if (r?.status === "ok") return sendText(chatId, walletBalancesText(r.wallets ?? []))
  return sendText(chatId, tr(lang, "bot.balanceLocked"), {
    reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.openApp"), url: `${DEFAULT_ABOUT.website}/wallets` }]] },
  })
}

// Voice notes: at most a minute, and a few per chat per hour (each one is a paid transcription).
const MAX_VOICE_SECONDS = 60
const MAX_VOICE_BYTES = 2_000_000
const VOICE_PER_HOUR = 30
const voiceLog = new Map<number, number[]>()

function voiceAllowed(chatId: number) {
  const now = Date.now()
  const recent = (voiceLog.get(chatId) ?? []).filter((t) => now - t < 3_600_000)
  if (recent.length >= VOICE_PER_HOUR) return false
  recent.push(now)
  voiceLog.set(chatId, recent)
  return true
}

type Voice = { file_id: string; duration?: number; file_size?: number }

/** A voice note from a linked chat: transcribe it, then treat it like a typed message. */
/** `onText`: a voice note replying to a prompt (e.g. a slip's note) — true when it took the text. */
export async function handleVoiceMessage(chatId: number, voice: Voice, ctx: Context, onText?: (text: string) => Promise<boolean>) {
  const lang = contextLocale(ctx)
  // Check the plan and opt-in before downloading or paying for a transcription.
  const stop = blocked(ctx, lang)
  if (stop) return sendText(chatId, stop)
  if (!transcriptionProvider()) return sendText(chatId, tr(lang, "bot.voiceOff"))
  if ((voice.duration ?? 0) > MAX_VOICE_SECONDS || (voice.file_size ?? 0) > MAX_VOICE_BYTES) return sendText(chatId, tr(lang, "bot.voiceTooLong"))
  if (!voiceAllowed(chatId)) return sendText(chatId, tr(lang, "bot.voiceLimit"))

  await tg("sendChatAction", { chat_id: chatId, action: "typing" })
  const file = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: voice.file_id })
  const path = file.result?.file_path
  if (!file.ok || !path || (file.result?.file_size ?? 0) > MAX_VOICE_BYTES) return sendText(chatId, tr(lang, "bot.voiceFailed"))
  let audio: Blob
  try {
    // The download URL contains the bot token: fetched here only, never logged or stored.
    const res = await fetch(`https://api.telegram.org/file/bot${botToken()}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return sendText(chatId, tr(lang, "bot.voiceFailed"))
    audio = new Blob([await res.arrayBuffer()], { type: "audio/ogg" })
  } catch {
    return sendText(chatId, tr(lang, "bot.voiceFailed"))
  }
  if (audio.size > MAX_VOICE_BYTES) return sendText(chatId, tr(lang, "bot.voiceTooLong"))

  const transcript = await transcribe(audio, lang)
  const text = transcript?.text.replace(/\s+/g, " ").slice(0, 300)
  // Server log (not the admin event log): what was heard, to diagnose recognition problems.
  console.info(
    `[voice] chat …${String(chatId).slice(-4)} · chat language ${lang} · ${transcript?.via ?? "-"} · heard ${transcript?.language ?? "?"}${transcript?.retried ? " (asked again as Khmer)" : ""}${transcript?.confidence ? ` · ${transcript.confidence}` : ""} · ${text ? `"${text.slice(0, 120)}"` : "no text"}`,
  )
  if (!text) return sendText(chatId, tr(lang, "bot.voiceFailed"))
  if (onText && (await onText(text))) return
  // Speech-to-text writes amounts as Khmer words ("ពីរដុល្លារ"): turn them into digits for the parser.
  return handleEntryMessage(chatId, khmerWordsToDigits(text), ctx, text)
}

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

/** ULTRA: a workspace button on the card re-does the entry for that workspace. */
async function switchWorkspace(cb: Callback, chatId: number, pendingId: string, prefix: string) {
  const ctx = await botContext(chatId)
  const lang = contextLocale(ctx)
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  // Only ULTRA with routing on may switch (the database checks it again on ✅).
  if (!ctx?.linked || !isRouting(ctx)) return answer(tr(lang, "bot.ultraOnly"), true)
  const { data } = await botDb().rpc("bot_pending", { p_key: botKey(), p_chat_id: chatId, p_pending_id: pendingId })
  const action = data as { text?: string; heard?: string | null; workspace_id?: string } | null
  if (!action?.text) return answer(tr(lang, "bot.expired"), true)
  const all = workspacesOf(ctx)
  const target = all.find((w) => w.id.startsWith(prefix))
  if (!target) return answer(tr(lang, "bot.saveFailed"), true)
  if (target.id === action.workspace_id) return answer()

  const parsed = parseEntry(action.text, { wallets: target.wallets, categories: target.categories, debts: target.debts, rate: target.rate })
  if (!parsed.ok) return answer(`${WS_ICON[target.type]} ${target.name}: ${failureText(parsed, target, lang)}`, true)
  const heard = action.heard ?? undefined
  // A new proposal replaces the old one (one open card per chat).
  const tags = entryTags(parsed, action.text)
  const newId = await propose(chatId, parsed, target, { text: action.text, heard, route: true, tags })
  if (!newId) return answer(tr(lang, "bot.saveFailed"), true)
  const { text, reply_markup } = card(lang, parsed, target, newId, { heard, switcher: all, tags })
  await answer(tr(lang, "bot.switched", { name: target.name }))
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(text), reply_markup })
}

type Confirmed = {
  ok: boolean
  reason?: string
  kind?: string
  tx_id?: string
  wallet?: string
  balance?: number
  wallet_currency?: "USD" | "KHR"
  remaining?: number
  debt_currency?: "USD" | "KHR"
  party?: string
  workspace?: string
  from?: string
}

/** ✅ / ❌ (and ULTRA's workspace buttons) on a card: save, drop or re-target it. */
export async function handleCallback(cb: Callback) {
  const chatId = cb.message?.chat.id
  const [verb, id, prefix] = (cb.data ?? "").split(":", 3)
  if (chatId && cb.message?.chat.type === "private" && verb === "lang" && (id === "km" || id === "en" || id === "zh")) {
    // The /lang buttons.
    const { data } = await botDb().rpc("bot_set_language", { p_key: botKey(), p_chat_id: chatId, p_language: id })
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: data ? tr(id, "bot.langSet") : tr(id, "bot.notLinked") })
    return
  }
  if (chatId && cb.message?.chat.type === "private" && (verb === "bp" || verb === "bs") && UUID.test(id ?? "")) {
    await billAction(cb, chatId, verb, id, prefix)
    return
  }
  if (chatId && cb.message?.chat.type === "private" && verb === "w" && UUID.test(id ?? "") && /^[0-9a-f]{8}$/.test(prefix ?? "")) {
    await switchWorkspace(cb, chatId, id, prefix)
    return
  }
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(id ?? "") || (verb !== "ok" && verb !== "no")) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const ctx = await botContext(chatId)
  const lang = contextLocale(ctx)
  const db = botDb()
  let outcome: string
  let savedTx: { id: string; workspace: string | null } | null = null
  if (verb === "no") {
    await db.rpc("bot_cancel", { p_key: botKey(), p_chat_id: chatId, p_pending_id: id })
    outcome = tr(lang, "bot.cancelled")
  } else {
    const { data, error } = await db.rpc("bot_confirm", { p_key: botKey(), p_chat_id: chatId, p_pending_id: id })
    const r = data as Confirmed | null
    if (error) {
      const msg = error.message ?? ""
      outcome = /plan_required/.test(msg)
        ? tr(lang, "bot.cmdPro")
        : /commands_off/.test(msg)
          ? tr(lang, "bot.cmdOff")
          : /not_writable/.test(msg)
            ? tr(lang, "bot.cmdReadonly")
            : /insufficient_balance/.test(msg)
              ? "⚠️ សមតុល្យក្នុងកាបូបប្រភពមិនគ្រប់គ្រាន់សម្រាប់ការផ្ទេរនេះទេ។"
              : tr(lang, "bot.saveFailed")
    } else if (!r?.ok) {
      outcome = tr(lang, "bot.expired")
    } else {
      // The wallet's balance is not shown (no-data-leak rule, see BALANCE_QUESTION).
      outcome =
        r.kind === "TOPUP"
          ? `✅ បានថប់អាប់ «${r.wallet ?? ""}» ពី ${r.from ?? ""} (ផ្ទេរប្រាក់)។`
          : r.kind === "REPAY"
          ? tr(lang, "bot.savedRepay", { party: r.party ?? "", remaining: formatMoney(Number(r.remaining), r.debt_currency ?? "USD"), wallet: r.wallet ?? "" })
          : tr(lang, "bot.saved", { wallet: r.wallet ?? "" })
      // With several workspaces, say which one it went to.
      if (isRouting(ctx) && r.workspace) outcome += ` · 🏢 ${r.workspace}`
      if (r.kind === "EXPENSE" && r.tx_id) savedTx = { id: r.tx_id, workspace: isRouting(ctx) ? (r.workspace ?? null) : null }
    }
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id })
  // A saved expense: the same card as a bank slip — ✓ on its meal and Need / Want, one tap to switch, 📝 note.
  if (verb === "ok" && savedTx) {
    const { data: row } = await tagTransaction(chatId, savedTx.id, null, null)
    if ((row as { ok?: boolean } | null)?.ok) {
      const saved = savedCard(lang, savedTx.id, taggedFrom(lang, row as TaggedRow))
      const text = savedTx.workspace ? `${saved.text}\n🏢 ${savedTx.workspace}` : saved.text
      await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(text).slice(0, 4000), reply_markup: saved.reply_markup })
      return
    }
  }
  // Keep the card's details, drop the question and buttons, add the outcome.
  const details = (cb.message?.text ?? "").split("\n\n")[0]
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(`${details}\n\n${outcome}`).slice(0, 4000) })
}

const MONTH_KM = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]

/** /car, /ev: this month's home charging (kWh), public charging, tolls and the prepaid balances (opt-in). */
export async function sendCarReport(chatId: number, lang: Locale) {
  const { data, error } = await botDb().rpc("bot_car_report", { p_key: botKey(), p_chat_id: chatId })
  const r = data as CarReport | null
  if (error || !r) return sendText(chatId, tr(lang, "bot.saveFailed"))
  if (r.status !== "ok") return sendText(chatId, tr(lang, "bot.notLinked"))
  const now = new Date(Date.now() + 7 * 3_600_000)
  const month = `ខែ${MONTH_KM[now.getUTCMonth()]} ${now.getUTCFullYear()}`
  return sendText(chatId, carReportText(r, month))
}
