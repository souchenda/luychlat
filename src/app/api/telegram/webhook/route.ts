import { timingSafeEqual } from "crypto"

import { after, NextResponse } from "next/server"

import type { Locale } from "@/lib/i18n/dictionaries"
import { asksForBalance, botContext, contextLocale, handleCallback, handleEntryMessage, handleVoiceMessage, isRouting, marketAnswer } from "@/lib/server/bot-commands"
import { botDb, botKey, sendText, SIGNATURE, tg, tr, webhookSecret } from "@/lib/server/telegram-bot"
import { currentMarket, phnomPenhToday, setFuelPrices, setManualGold, setManualRate } from "@/lib/server/market-sync"
import { parseSetFuel, parseSetRate } from "@/lib/market-calc"
import { fuelLines } from "@/lib/bot/fuel"
import { isInvoiceRequest } from "@/lib/bot/parse-invoice"
import { transcriptionProvider } from "@/lib/server/transcribe"
import { parseSetGold, plausible } from "@/lib/local-gold"
import { logEvent } from "@/lib/server/events"
import { sendDigestNow } from "@/lib/server/weekly-digest"
import { handleInvoiceCallback, handleInvoiceMessage, isInvoiceCallback } from "@/lib/server/invoice-bot"
import { asksWhoOwesMe, awaitingAiQuestion, handleAiQuestion, isAiQuestion } from "@/lib/server/ai-bot"
import { sendNssfInfo } from "@/lib/server/nssf-bot"
import { bestPhoto, handlePoolGroupCommand, handlePoolPhotoReply } from "@/lib/server/pool-bot"
import { handleBankAlert, handleBankUndoCallback, isBankUndo } from "@/lib/server/bank-alert-bot"
import { parseBankAlert } from "@/lib/bot/bank-alert"
import { isGiftMessage } from "@/lib/bot/parse-gift"
import { handleGiftCallback, handleGiftLookup, handleGiftMessage, isGiftCallback } from "@/lib/server/gift-bot"
import { botFeatures, featureOk, keyboardFor, menuCommand } from "@/lib/server/bot-menu"
import { appUrl, marketSnapshotText } from "@/lib/server/community-bulletin"
import { unsafeByName } from "@/lib/reconcile/file-safety"

/**
 * Updates from Telegram for the official bot. Telegram sends the secret we
 * registered with setWebhook in a header; anything else is rejected.
 *   /start <code>  link this chat to the LuyChlat account that made the code
 *   /start, /help  how to connect
 *   /stop          unlink
 *   anything else  from a linked chat: an expense / income / debt payment to
 *                  confirm with ✅ / ❌ (PRO, opt-in; see bot-commands.ts)
 *   voice note     the same, after speech-to-text
 *   file           never downloaded: statements are imported in the app (read
 *                  on the phone). Programs / macro files get a security
 *                  warning and a security event; repeat senders are ignored.
 * Only private chats are handled. Always answers 200 so Telegram doesn't retry.
 */
export const runtime = "nodejs"

type Update = {
  callback_query?: Parameters<typeof handleCallback>[0]
  message?: {
    text?: string
    caption?: string
    photo?: { file_id: string; width?: number; file_size?: number }[]
    reply_to_message?: { message_id: number; from?: { is_bot?: boolean } }
    voice?: { file_id: string; duration?: number; file_size?: number }
    document?: { file_name?: string; mime_type?: string; file_size?: number }
    /** Shared with the "📱 Share my number" button (password reset). */
    contact?: { phone_number: string; user_id?: number }
    chat: { id: number; type: string }
    from?: { id?: number; username?: string; language_code?: string }
  }
}

/** "📖 User manual: https://…/guide" under the help texts (nothing when the address is unknown). */
async function guideLine(lang: Locale) {
  const url = await appUrl()
  return url ? `\n\n${tr(lang, "bot.guideLine", { url: `${url}/guide` })}` : ""
}

// Groups: the privacy note at most once per 10 minutes per group (no spam).
const groupNoticeAt = new Map<number, number>()

/**
 * In a group the bot only answers public market questions (/rate, /gold,
 * /fuel, /gas). Anything personal — logging, balances, /digest, /nssf, … —
 * gets a short note pointing to the private chat, never data. Plain chatter
 * is ignored.
 */
async function handleGroupMessage(chatId: number, text: string, lang: Locale, fromId?: number, photo?: { fileId: string | null; replyTo: number | null }) {
  const command = text.trim().split(/\s+/, 1)[0] ?? ""
  // A receipt photo sent as a reply to the bot's expense card (the keeper only).
  if (!command.startsWith("/") && photo?.fileId && photo.replyTo) {
    await handlePoolPhotoReply(chatId, fromId, photo.replyTo, photo.fileId, lang)
    return
  }
  if (!command.startsWith("/")) return
  // A shared pool the keeper linked to this group: /pool, /fund, /trip, /spend (with a photo too), /pool link CODE.
  if (await handlePoolGroupCommand(chatId, fromId, text, lang, photo?.fileId ?? null)) return
  if (/^\/(rate|gold)(@\w+)?$/i.test(command)) {
    const answer = await marketAnswer(text, lang)
    if (answer) await sendText(chatId, answer)
    return
  }
  if (/^\/market(@\w+)?$/i.test(command)) {
    await sendText(chatId, marketSnapshotText(await currentMarket(), lang, phnomPenhToday().day))
    return
  }
  if (/^\/(fuel|gas)(@\w+)?$/i.test(command)) {
    const fuel = (await currentMarket())?.fuel
    await sendText(chatId, fuel ? fuelLines(fuel, (k, p) => tr(lang, k, p), phnomPenhToday().day, lang).join("\n") : tr(lang, "fuel.none"))
    return
  }
  const now = Date.now()
  if (now - (groupNoticeAt.get(chatId) ?? 0) < 10 * 60_000) return
  groupNoticeAt.set(chatId, now)
  if (groupNoticeAt.size > 5_000) groupNoticeAt.delete(groupNoticeAt.keys().next().value!)
  const me = await tg<{ username?: string }>("getMe", {})
  await sendText(chatId, tr(lang, "bot.groupPrivate", { bot: me.result?.username ? `@${me.result.username}` : "@luychlat_bot" }))
}

async function isAdminChat(chatId: number) {
  const { data } = await botDb().rpc("bot_admin_chats", { p_key: botKey() })
  return ((data as { chat_id: number }[] | null) ?? []).some((r) => Number(r.chat_id) === chatId)
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

/** /setrate <KHR per USD> [<as-of date>] · /setrate clear — NBC's newer official rate when the automatic feed lags. */
/** /setfuel <regular> <super> <diesel> [<lpg>[kg|L]] [<from> <to>] — MoC prices for a 10-day cycle (admins). */
async function setFuelReply(text: string, chatId: number) {
  const today = phnomPenhToday().day
  const input = parseSetFuel(text, today)
  if (!input) {
    const fuel = (await currentMarket())?.fuel
    return [
      "⛽ /setfuel <សាំងធម្មតា> <សាំងស៊ុបពែរ> <ម៉ាស៊ូត> [<ហ្កាស>kg|L] [<ពីថ្ងៃ> <ដល់ថ្ងៃ>]",
      "ឧ. /setfuel 4150 4500 3950 3800kg  (វដ្ដ ១០ ថ្ងៃបច្ចុប្បន្ន)",
      "ឧ. /setfuel 4150 4500 3950 3800kg 11-10-2026 20-10-2026",
      ...(fuel ? ["", ...fuelLines(fuel, (k, p) => tr("km", k, p), today, "km")] : []),
    ].join("\n")
  }
  const saved = await setFuelPrices(input)
  if (!saved?.fuel) return "⚠️ មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។"
  const note = `${input.regular}/${input.super}/${input.diesel}${input.lpg ? `/${input.lpg}${input.lpg_unit}` : ""} · ${input.from}–${input.to}`
  logEvent("info", "setfuel", `Fuel prices set via Telegram: ${note}`)
  await botDb().rpc("bot_admin_audit", { p_key: botKey(), p_chat_id: chatId, p_action: "SET_FUEL_PRICES", p_note: note })
  return ["✅ បានកំណត់តម្លៃប្រេង៖", ...fuelLines(saved.fuel, (k, p) => tr("km", k, p), today, "km")].join("\n")
}

async function setRateReply(text: string, chatId: number) {
  const input = parseSetRate(text, phnomPenhToday().day)
  if (!input) {
    const nbc = (await currentMarket())?.nbc
    const now = nbc ? `\nឥឡូវ៖ $1 = ${nbc.usd_khr.toLocaleString("en-US")}៛ · As of ${ddmmyyyy(nbc.date)} (${nbc.source === "manual" ? "admin" : "Frankfurter"})` : ""
    return `💵 /setrate <អត្រា> [<ថ្ងៃ As of>]\nឧ. /setrate 4057 05-10-2026 (ថ្ងៃលំនាំដើម = ថ្ងៃធ្វើការបន្ទាប់)\n/setrate clear — ត្រឡប់ទៅប្រភពស្វ័យប្រវត្តិ${now}`
  }
  const saved = await setManualRate(input)
  if (!saved) return "⚠️ មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។"
  logEvent("info", "setrate", input === "clear" ? "NBC rate back to the automatic source (Telegram /setrate clear)" : `NBC rate set via Telegram: $1 = ${input.usd_khr} KHR as of ${input.date}`)
  await botDb().rpc("bot_admin_audit", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_action: input === "clear" ? "CLEAR_RATE_OVERRIDE" : "SET_RATE_OVERRIDE",
    p_note: input === "clear" ? null : `$1 = ${input.usd_khr} KHR · as of ${input.date}`,
  })
  if (input === "clear") return "✅ ត្រឡប់ទៅអត្រា NBC ស្វ័យប្រវត្តិ។"
  return `✅ បានកំណត់អត្រា NBC៖ $1 = ${input.usd_khr.toLocaleString("en-US")}៛ · As of ${ddmmyyyy(input.date)}\nប្រើរហូតដល់ប្រភពស្វ័យប្រវត្តិមានអត្រាថ្ងៃនោះ។`
}

/** /setgold <kilo sell> <kilo buy> [<jewelry sell> <jewelry buy>] · /setgold clear */
async function setGoldReply(text: string, chatId: number) {
  const input = parseSetGold(text)
  if (!input) {
    const local = (await currentMarket())?.local_gold
    const now = local ? `\nឥឡូវ (${local.date}, ${local.source === "manual" ? "admin" : "CSNJ"})៖ មាសគីឡូ ${usd(local.kilo.sell)} / ${usd(local.kilo.buy)}${local.jewelry ? ` · មាសគ្រឿង ${usd(local.jewelry.sell)} / ${usd(local.jewelry.buy)}` : ""}` : ""
    return `🪙 /setgold <គីឡូលក់> <គីឡូទិញ> [<គ្រឿងលក់> <គ្រឿងទិញ>]\nឧ. /setgold 5010 4960 5010 4935\n/setgold clear — ត្រឡប់ទៅតម្លៃ CSNJ ស្វ័យប្រវត្តិ${now}`
  }
  if (input !== "clear") {
    const reference = (await currentMarket())?.gold?.reference.GOLD_24K
    if (!plausible(input, reference)) return "⚠️ តម្លៃមិនសមហេតុផល (ទិញ ≤ លក់ ហើយជិតតម្លៃទីផ្សារ)។ សូមពិនិត្យលេខម្ដងទៀត។"
  }
  const saved = await setManualGold(input)
  if (!saved) return "⚠️ មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។"
  logEvent("info", "setgold", input === "clear" ? "Gold prices back to CSNJ (Telegram /setgold clear)" : `Gold prices set via Telegram: kilo ${input.kilo.sell}/${input.kilo.buy}${input.jewelry ? `, jewelry ${input.jewelry.sell}/${input.jewelry.buy}` : ""}`)
  // Admin audit log (as the admin linked to this chat).
  await botDb().rpc("bot_admin_audit", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_action: input === "clear" ? "CLEAR_GOLD_OVERRIDE" : "SET_GOLD_OVERRIDE",
    p_note: input === "clear" ? null : `kilo ${input.kilo.sell}/${input.kilo.buy}${input.jewelry ? ` · jewelry ${input.jewelry.sell}/${input.jewelry.buy}` : ""}`,
  })
  if (input === "clear") return "✅ ត្រឡប់ទៅតម្លៃ CSNJ ស្វ័យប្រវត្តិ (Oknha News)។"
  const j = saved.local_gold?.jewelry
  return `✅ បានកំណត់តម្លៃមាសថ្ងៃនេះ៖\n• មាសគីឡូ: លក់ចេញ ${usd(input.kilo.sell)} | ទិញចូល ${usd(input.kilo.buy)}${j ? `\n• មាសគ្រឿង: លក់ចេញ ${usd(j.sell)} | ទិញចូល ${usd(j.buy)}` : ""}\nបង្ហាញក្នុងកម្មវិធី និង bulletin ថ្ងៃនេះ។`
}

// Unsafe files per chat in the last 24 hours (this server's memory); from the 3rd on, the chat is ignored.
const unsafeFiles = new Map<number, number[]>()

/** A file sent to the bot. It is never downloaded or opened. */
async function handleDocument(chatId: number, doc: NonNullable<NonNullable<Update["message"]>["document"]>, languageCode?: string) {
  const ctx = await botContext(chatId)
  const lang: Locale = ctx?.linked ? contextLocale(ctx) : telegramLocale(languageCode)
  const reason = unsafeByName(doc.file_name ?? "", doc.mime_type)
  if (!reason) {
    await sendText(chatId, tr(lang, "bot.fileUseApp") + SIGNATURE)
    return
  }
  const now = Date.now()
  const recent = (unsafeFiles.get(chatId) ?? []).filter((t) => now - t < 86_400_000)
  recent.push(now)
  unsafeFiles.set(chatId, recent)
  if (unsafeFiles.size > 10_000) unsafeFiles.delete(unsafeFiles.keys().next().value!)
  if (recent.length > 3) return
  const ext = (doc.file_name ?? "").toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "?"
  logEvent("security", "upload-bot", `Unsafe file sent to the bot (${reason}, .${ext})${ctx?.linked ? "" : " · unlinked chat"}${recent.length === 3 ? " — chat ignored 24 h" : ""}`, { fold: true })
  await sendText(chatId, tr(lang, "recon.file.unsafe"))
}

/** Telegram's interface language → ours (Chinese variants → zh). */
/**
 * The bot's language before a chat picks one: Khmer, except Chinese for a
 * Chinese Telegram app. An English phone setting is common in Cambodia, so it
 * no longer means English — users switch with /lang (or /en).
 */
function telegramLocale(code: string | undefined): Locale {
  if (code?.startsWith("zh")) return "zh"
  return "km"
}

/** /lang without a choice: one button per language. */
const LANG_BUTTONS = {
  inline_keyboard: [
    [
      { text: "🇰🇭 ភាសាខ្មែរ", callback_data: "lang:km" },
      { text: "🇨🇳 中文", callback_data: "lang:zh" },
      { text: "🇬🇧 English", callback_data: "lang:en" },
    ],
  ],
}

function sameSecret(a: string | null, b: string | null) {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** A button of a feature still in testing, tapped by an account that can't use it yet. */
async function soon(callbackId: string, lang: Locale) {
  await tg("answerCallbackQuery", { callback_query_id: callbackId, text: tr(lang, "bot.featureSoon").slice(0, 190), show_alert: true })
}

export async function POST(request: Request) {
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret())) {
    // Someone other than Telegram (or an old secret) calling the webhook.
    logEvent("security", "webhook", "Rejected webhook call: wrong or missing secret", { fold: true })
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  let update: Update
  try {
    update = (await request.json()) as Update
  } catch {
    return NextResponse.json({ ok: true })
  }
  if (update.callback_query) {
    if (isGiftCallback(update.callback_query.data)) {
      const ctx = update.callback_query.message ? await botContext(update.callback_query.message.chat.id) : null
      const chat = update.callback_query.message?.chat.id
      if (chat && !featureOk(await botFeatures(chat), "gifts")) await soon(update.callback_query.id, contextLocale(ctx))
      else await handleGiftCallback(update.callback_query, contextLocale(ctx))
    } else if (isBankUndo(update.callback_query.data)) {
      const ctx = update.callback_query.message ? await botContext(update.callback_query.message.chat.id) : null
      await handleBankUndoCallback(update.callback_query, contextLocale(ctx))
    } else if (isInvoiceCallback(update.callback_query.data)) {
      const chat = update.callback_query.message?.chat.id
      if (chat && !featureOk(await botFeatures(chat), "invoices")) await soon(update.callback_query.id, "km")
      else await handleInvoiceCallback(update.callback_query)
    }
    else await handleCallback(update.callback_query)
    return NextResponse.json({ ok: true })
  }
  const message = update.message
  if (message && (message.chat.type === "group" || message.chat.type === "supergroup")) {
    await handleGroupMessage(message.chat.id, message.text ?? message.caption ?? "", telegramLocale(message.from?.language_code), message.from?.id, {
      fileId: bestPhoto(message.photo),
      replyTo: message.reply_to_message?.from?.is_bot ? message.reply_to_message.message_id : null,
    })
    return NextResponse.json({ ok: true })
  }
  if (!message || message.chat.type !== "private") return NextResponse.json({ ok: true })

  if (message.voice) {
    const chatId = message.chat.id
    const voice = message.voice
    // Downloading and transcribing can take a while: answer Telegram now so it doesn't resend the update.
    after(async () => {
      const ctx = await botContext(chatId)
      if (!ctx?.linked) await sendText(chatId, tr("km", "bot.help") + SIGNATURE)
      else await handleVoiceMessage(chatId, voice, ctx)
    })
    return NextResponse.json({ ok: true })
  }
  // Password reset: the person shared their own Telegram contact (Telegram has verified the number).
  if (message.contact) {
    const chatId = message.chat.id
    const lang = telegramLocale(message.from?.language_code)
    const own = message.contact.user_id !== undefined && message.contact.user_id === message.from?.id
    const done = { reply_markup: { remove_keyboard: true } }
    if (!own) {
      await sendText(chatId, tr(lang, "bot.resetNotOwnContact"), done)
      return NextResponse.json({ ok: true })
    }
    const { data } = await botDb().rpc("bot_reset_contact", { p_key: botKey(), p_chat_id: chatId, p_phone: message.contact.phone_number })
    const r = data as { status?: string; code?: string } | null
    if (r?.status === "ok" && r.code) await tg("sendMessage", { chat_id: chatId, text: tr(lang, "bot.resetCode", { code: r.code }), parse_mode: "HTML", ...done })
    else await sendText(chatId, tr(lang, r?.status === "mismatch" ? "bot.resetMismatch" : "bot.resetExpired"), done)
    return NextResponse.json({ ok: true })
  }
  if (message.document) {
    await handleDocument(message.chat.id, message.document, message.from?.language_code)
    return NextResponse.json({ ok: true })
  }
  if (!message.text) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  // Before linking, replies follow the Telegram app's language (Khmer by default);
  // linked chats use the language chosen in the app or with /lang.
  const lang: Locale = telegramLocale(message.from?.language_code)
  // A tap on the 1-tap keyboard runs the same handler as its slash command.
  const text = menuCommand(message.text) ?? message.text
  const [command, payload] = text.trim().split(/\s+/, 2)
  const key = botKey()!
  const db = botDb()

  // /start reset_<token>: the deep link from "forgot password" in the app.
  if (command === "/start" && payload && /^reset_[0-9a-f]{32}$/.test(payload)) {
    const { data } = await db.rpc("bot_reset_bind", { p_key: key, p_token: payload.slice(6), p_chat_id: chatId })
    if (data === "phone") {
      // Only the person's own number proves the account: Telegram shares it with this button.
      await sendText(chatId, tr(lang, "bot.resetShareContact"), {
        reply_markup: { keyboard: [[{ text: tr(lang, "bot.resetShareButton"), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
      })
    } else await sendText(chatId, tr(lang, data === "other" ? "bot.resetUseEmail" : "bot.resetExpired"))
    return NextResponse.json({ ok: true })
  }
  if (command === "/start" && payload && /^[0-9a-fA-F]{32}$/.test(payload)) {
    const { data, error } = await db.rpc("bot_link_chat", {
      p_key: key,
      p_code: payload,
      p_chat_id: chatId,
      p_username: message.from?.username ?? null,
      p_language: telegramLocale(message.from?.language_code),
    })
    const result = data as { ok: boolean; name?: string } | null
    if (error || !result?.ok) await sendText(chatId, tr(lang, "bot.linkFailed") + SIGNATURE)
    else await sendText(chatId, tr(lang, "bot.linked", { name: result.name || "" }) + SIGNATURE, await keyboardFor(chatId, lang))
  } else if (/^\/setgold(@\w+)?$/i.test(command) && (await isAdminChat(chatId))) {
    // Admins only: today's Phnom Penh gold counter prices (others get the normal help).
    await sendText(chatId, await setGoldReply(text, chatId))
  } else if (/^\/setfuel(@\w+)?$/i.test(command) && (await isAdminChat(chatId))) {
    // Admins only: MoC fuel and gas prices for a 10-day cycle (others get the normal help).
    await sendText(chatId, await setFuelReply(text, chatId))
  } else if (/^\/market(@\w+)?$/i.test(command)) {
    // The whole market snapshot (NBC, gold, fuel): for every chat, linked or not.
    const ctx = await botContext(chatId)
    await sendText(chatId, marketSnapshotText(await currentMarket(), ctx?.linked ? contextLocale(ctx) : lang, phnomPenhToday().day))
  } else if (/^\/(fuel|gas)(@\w+)?$/i.test(command)) {
    // Fuel and gas prices: for every chat, linked or not.
    const ctx = await botContext(chatId)
    const replyLang = ctx?.linked ? contextLocale(ctx) : lang
    const fuel = (await currentMarket())?.fuel
    await sendText(chatId, fuel ? fuelLines(fuel, (k, p) => tr(replyLang, k, p), phnomPenhToday().day, replyLang).join("\n") : tr(replyLang, "fuel.none"))
  } else if (/^\/setrate(@\w+)?$/i.test(command) && (await isAdminChat(chatId))) {
    // Admins only: NBC's newer official USD rate (others get the normal help).
    await sendText(chatId, await setRateReply(text, chatId))
  } else if (/^\/(lang|language|km|en|zh)(@\w+)?$/i.test(command)) {
    // /lang km | en | zh, or the shortcuts /km /en /zh — the bot's language for this chat; /lang alone shows buttons.
    const short = command.slice(1).split("@")[0].toLowerCase()
    const choice = short === "km" || short === "en" || short === "zh" ? short : payload?.toLowerCase()
    if (choice === "km" || choice === "en" || choice === "zh") {
      const { data } = await db.rpc("bot_set_language", { p_key: key, p_chat_id: chatId, p_language: choice })
      await sendText(chatId, data ? tr(choice, "bot.langSet") : tr(choice, "bot.notLinked"), await keyboardFor(chatId, choice))
    } else {
      const ctx = await botContext(chatId)
      await sendText(chatId, tr(ctx?.linked ? contextLocale(ctx) : lang, "bot.langPick"), { reply_markup: LANG_BUTTONS })
    }
  } else if (/^\/nssf(@\w+)?$/i.test(command)) {
    // NSSF basics, and the account's own cards with copy buttons.
    const ctx = await botContext(chatId)
    await sendNssfInfo(chatId, ctx?.linked ? contextLocale(ctx) : lang)
  } else if (/^\/(digest|weekly)(@\w+)?$/i.test(command)) {
    // This week's digest now — only for chats that switched the digest on (it shows money totals).
    await sendDigestNow(chatId, lang)
  } else if (/^\/(rate|gold)(@\w+)?$/i.test(command)) {
    // Calculators: for every chat, linked or not.
    const ctx = await botContext(chatId)
    const answer = await marketAnswer(text, ctx?.linked ? contextLocale(ctx) : lang)
    if (answer) await sendText(chatId, answer)
  } else if (/^\/(ai|ask)(@\w+)?$/i.test(command)) {
    // LuyChlat AI: "/ai <question>", or /ai alone (and the 🤖 button) to be asked for one. Answered after the reply to Telegram.
    const ctx = await botContext(chatId)
    if (!ctx?.linked) await sendText(chatId, tr(lang, "bot.help") + SIGNATURE, await keyboardFor(chatId, lang))
    else {
      const question = text.trim().replace(/^\S+\s*/, "").slice(0, 1000)
      after(() => handleAiQuestion(chatId, question, contextLocale(ctx)))
    }
  } else if (/^\/(guide|manual)(@\w+)?$/i.test(command)) {
    // The user guide, as a button that opens it.
    const ctx = await botContext(chatId)
    const replyLang = ctx?.linked ? contextLocale(ctx) : lang
    const url = await appUrl()
    await sendText(chatId, tr(replyLang, "bot.guideIntro"), url ? { reply_markup: { inline_keyboard: [[{ text: tr(replyLang, "bot.guideButton"), url: `${url}/guide` }]] } } : {})
  } else if (/^\/gift(@\w+)?$/i.test(command)) {
    // /gift <name>: the two-way gift history (linked chats; the database checks plan and opt-in).
    const ctx = await botContext(chatId)
    if (!ctx?.linked) await sendText(chatId, tr(lang, "bot.help") + SIGNATURE, await keyboardFor(chatId, lang))
    else if (!featureOk(await botFeatures(chatId), "gifts")) await sendText(chatId, tr(contextLocale(ctx), "bot.featureSoon"))
    else await handleGiftLookup(chatId, text.trim().replace(/^\S+\s*/, ""), contextLocale(ctx))
  } else if (/^\/(pool|fund|trip|spend)(@\w+)?$/i.test(command)) {
    // Shared pools live in the group the keeper linked (never balances in a private chat).
    await sendText(chatId, tr(lang, "pool.bot.private"))
  } else if (isInvoiceRequest(text)) {
    // /invoice, "គិតលុយ 12$ …": a receipt photo with KHQR to forward (FREE: 5 a month) — while in testing, staff and test accounts only.
    if (!featureOk(await botFeatures(chatId), "invoices")) await sendText(chatId, tr(lang, "bot.featureSoon"))
    else await handleInvoiceMessage(chatId, text.trim().slice(0, 500), lang)
  } else if (command === "/stop") {
    const { data } = await db.rpc("bot_unlink_chat", { p_key: key, p_chat_id: chatId })
    await sendText(chatId, tr(lang, data ? "bot.unlinked" : "bot.notLinked") + SIGNATURE)
  } else {
    // Linked chats: /help shows the logging examples, other text is an entry to confirm.
    const ctx = await botContext(chatId)
    const answer = ctx?.linked ? null : await marketAnswer(text, lang)
    if (!ctx?.linked) await sendText(chatId, answer ?? tr(lang, "bot.help") + (await guideLine(lang)) + SIGNATURE, answer ? {} : await keyboardFor(chatId, lang))
    else if (asksForBalance(command)) await handleEntryMessage(chatId, command, ctx) // /balance → the in-app pointer
    else if (command.startsWith("/")) {
      const locale = contextLocale(ctx)
      const extras = [transcriptionProvider() && tr(locale, "bot.cmdHelpVoice"), isRouting(ctx) && tr(locale, "bot.cmdHelpRoute")].filter(Boolean)
      // /start, /help and unknown commands: the examples, with the 1-tap keyboard.
      await sendText(chatId, [tr(locale, "bot.cmdHelp"), ...extras].join("\n\n") + (await guideLine(locale)), await keyboardFor(chatId, locale))
    }
    else {
      const plain = message.text.trim()
      const locale = contextLocale(ctx)
      // Gifts in testing: for everyone else a gift-like message is simply an entry to log.
      const giftText = isGiftMessage(plain) && featureOk(await botFeatures(chatId), "gifts")
      // A bank alert forwarded (or pasted) to the bot: saved at once, with ↩️ Undo.
      const alert = parseBankAlert(plain)
      // Calculators first ("how much is 100$ in riel?" has an exact answer), then questions for LuyChlat AI
      // (PRO: free accounts keep the privacy pointer for balance questions), then an entry to log.
      const calc = alert ? null : await marketAnswer(plain, locale)
      const toAi =
        !alert &&
        !giftText &&
        !calc &&
        (isAiQuestion(plain) || asksWhoOwesMe(plain) || (ctx.pro && asksForBalance(plain)) || (ctx.pro && (await awaitingAiQuestion(chatId))))
      if (alert) await handleBankAlert(chatId, alert, plain, locale)
      else if (giftText) await handleGiftMessage(chatId, plain, locale)
      else if (calc) await sendText(chatId, calc)
      else if (toAi) after(() => handleAiQuestion(chatId, plain.slice(0, 1000), locale))
      else await handleEntryMessage(chatId, plain.slice(0, 300), ctx)
    }
  }
  return NextResponse.json({ ok: true })
}
