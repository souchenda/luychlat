// Server only: chat logging for the official bot (Phase C part 2).
import { khmerWordsToDigits } from "@/lib/bot/khmer-numbers"
import { parseEntry, type BotCategory, type BotDebt, type BotWallet, type ParsedEntry } from "@/lib/bot/parse-entry"
import { routeWorkspace } from "@/lib/bot/route-workspace"
import type { Locale } from "@/lib/i18n/dictionaries"
import { convert, formatMoney } from "@/lib/money"
import { botDb, botKey, botToken, sendText, tg, tr } from "@/lib/server/telegram-bot"
import { transcribe, transcriptionProvider } from "@/lib/server/transcribe"

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

type Context = {
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

export const contextLocale = (ctx: Context | null): Locale => (ctx?.language === "en" ? "en" : "km")

/** ULTRA with "log into all workspaces" on, and more than one to choose from. */
export const isRouting = (ctx: Context | null) => Boolean(ctx?.route_all && (ctx.workspaces?.length ?? 0) > 1)

/** Why this chat can't log right now (PRO, opt-in, write access), or null. */
function blocked(ctx: Context, lang: Locale) {
  if (!ctx.pro) return tr(lang, "bot.cmdPro")
  if (!ctx.enabled) return tr(lang, "bot.cmdOff")
  if (!ctx.writable) return tr(lang, "bot.cmdReadonly")
  return null
}

/** Workspaces from the context, with numbers as numbers. */
function workspacesOf(ctx: Context): Workspace[] {
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
  const list = ws.debts.map((d) => `${d.party_name} (${formatMoney(d.remaining, d.currency)})`).join(", ")
  return list ? tr(lang, "bot.cmdNoDebt", { list }) : tr(lang, "bot.cmdNoDebts")
}

const WS_ICON: Record<Workspace["type"], string> = { PERSONAL: "👤", BUSINESS: "🏪", FAMILY: "👨‍👩‍👧" }

/** The confirmation card's text and buttons (with the workspace switcher when routing). */
function card(lang: Locale, parsed: Parsed, ws: Workspace, pendingId: string, opts: { heard?: string; switcher?: Workspace[] }) {
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
          `🏷️ ${parsed.category?.name ?? tr(lang, "bot.cardUncategorized")}`,
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
async function propose(chatId: number, parsed: Parsed, ws: Workspace, extra: { text: string; heard?: string; route: boolean }) {
  const base =
    parsed.kind === "REPAY"
      ? { kind: "REPAY", debt_id: parsed.debt.id, wallet_id: parsed.wallet.id, amount: parsed.amount, note: parsed.note }
      : { kind: parsed.kind, wallet_id: parsed.wallet.id, category_id: parsed.category?.id ?? null, amount: parsed.amount, currency: parsed.currency, note: parsed.note }
  // The parsed text (and transcript) are kept so the card can be re-done for another workspace.
  const action = { ...base, text: extra.text, heard: extra.heard ?? null, ...(extra.route ? { workspace_id: ws.id } : {}) }
  const { data, error } = await botDb().rpc("bot_propose", { p_key: botKey(), p_chat_id: chatId, p_action: action })
  return error || typeof data !== "string" ? null : data
}

/**
 * Handles a non-command message from a linked chat. `heard` is set for voice
 * notes: the transcript is shown on top of the card (and of any error) so the
 * user can see what was understood. ULTRA chats with routing on go to the
 * workspace named in the message (default Personal) and get a switcher.
 */
export async function handleEntryMessage(chatId: number, text: string, ctx: Context, heard?: string) {
  const lang = contextLocale(ctx)
  const stop = blocked(ctx, lang)
  if (stop) return sendText(chatId, stop)
  const said = heard ? `${tr(lang, "bot.voiceHeard", { text: heard })}\n` : ""
  const reply = (message: string) => sendText(chatId, said + message)

  const all = workspacesOf(ctx)
  const route = isRouting(ctx)
  const { workspace: ws, text: input } = route ? routeWorkspace(text, all, ctx.workspace_id ?? all[0].id) : { workspace: all[0], text }
  const parsed = parseEntry(input, { wallets: ws.wallets, categories: ws.categories, debts: ws.debts, rate: ws.rate })
  if (!parsed.ok) return reply(failureText(parsed, ws, lang))

  const pendingId = await propose(chatId, parsed, ws, { text: input, heard, route })
  if (!pendingId) return reply(tr(lang, "bot.saveFailed"))
  const { text: body, reply_markup } = card(lang, parsed, ws, pendingId, { heard, switcher: route ? all : undefined })
  return sendText(chatId, body, { reply_markup })
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
export async function handleVoiceMessage(chatId: number, voice: Voice, ctx: Context) {
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

  const text = (await transcribe(audio, lang))?.replace(/\s+/g, " ").slice(0, 300)
  if (!text) return sendText(chatId, tr(lang, "bot.voiceFailed"))
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
  const newId = await propose(chatId, parsed, target, { text: action.text, heard, route: true })
  if (!newId) return answer(tr(lang, "bot.saveFailed"), true)
  const { text, reply_markup } = card(lang, parsed, target, newId, { heard, switcher: all })
  await answer(tr(lang, "bot.switched", { name: target.name }))
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text, reply_markup })
}

type Confirmed = {
  ok: boolean
  reason?: string
  kind?: string
  wallet?: string
  balance?: number
  wallet_currency?: "USD" | "KHR"
  remaining?: number
  debt_currency?: "USD" | "KHR"
  party?: string
  workspace?: string
}

/** ✅ / ❌ (and ULTRA's workspace buttons) on a card: save, drop or re-target it. */
export async function handleCallback(cb: Callback) {
  const chatId = cb.message?.chat.id
  const [verb, id, prefix] = (cb.data ?? "").split(":", 3)
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
            : tr(lang, "bot.saveFailed")
    } else if (!r?.ok) {
      outcome = tr(lang, "bot.expired")
    } else {
      const balance = formatMoney(Number(r.balance), r.wallet_currency ?? "USD")
      outcome =
        r.kind === "REPAY"
          ? tr(lang, "bot.savedRepay", { party: r.party ?? "", remaining: formatMoney(Number(r.remaining), r.debt_currency ?? "USD"), wallet: r.wallet ?? "", balance })
          : tr(lang, "bot.saved", { wallet: r.wallet ?? "", balance })
      // With several workspaces, say which one it went to.
      if (isRouting(ctx) && r.workspace) outcome += ` · 🏢 ${r.workspace}`
    }
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id })
  // Keep the card's details, drop the question and buttons, add the outcome.
  const details = (cb.message?.text ?? "").split("\n\n")[0]
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: `${details}\n\n${outcome}`.slice(0, 4000) })
}
