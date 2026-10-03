import { timingSafeEqual } from "crypto"

import { after, NextResponse } from "next/server"

import type { Locale } from "@/lib/i18n/dictionaries"
import { botContext, contextLocale, handleCallback, handleEntryMessage, handleVoiceMessage, isRouting } from "@/lib/server/bot-commands"
import { botDb, botKey, sendText, SIGNATURE, tr, webhookSecret } from "@/lib/server/telegram-bot"
import { setManualGold, currentMarket } from "@/lib/server/market-sync"
import { transcriptionProvider } from "@/lib/server/transcribe"
import { parseSetGold, plausible } from "@/lib/local-gold"
import { logEvent } from "@/lib/server/events"
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
    voice?: { file_id: string; duration?: number; file_size?: number }
    document?: { file_name?: string; mime_type?: string; file_size?: number }
    chat: { id: number; type: string }
    from?: { username?: string; language_code?: string }
  }
}

async function isAdminChat(chatId: number) {
  const { data } = await botDb().rpc("bot_admin_chats", { p_key: botKey() })
  return ((data as { chat_id: number }[] | null) ?? []).some((r) => Number(r.chat_id) === chatId)
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`

/** /setgold <kilo sell> <kilo buy> [<jewelry sell> <jewelry buy>] · /setgold clear */
async function setGoldReply(text: string) {
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
function telegramLocale(code: string | undefined): Locale {
  if (code?.startsWith("zh")) return "zh"
  if (code?.startsWith("en")) return "en"
  return "km"
}

function sameSecret(a: string | null, b: string | null) {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
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
    await handleCallback(update.callback_query)
    return NextResponse.json({ ok: true })
  }
  const message = update.message
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
  if (message.document) {
    await handleDocument(message.chat.id, message.document, message.from?.language_code)
    return NextResponse.json({ ok: true })
  }
  if (!message.text) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  // Before linking, replies follow the Telegram app's language (Khmer by default);
  // linked chats use the language chosen in the app or with /lang.
  const lang: Locale = telegramLocale(message.from?.language_code)
  const [command, payload] = message.text.trim().split(/\s+/, 2)
  const key = botKey()!
  const db = botDb()

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
    else await sendText(chatId, tr(lang, "bot.linked", { name: result.name || "" }) + SIGNATURE)
  } else if (/^\/setgold(@\w+)?$/i.test(command) && (await isAdminChat(chatId))) {
    // Admins only: today's Phnom Penh gold counter prices (others get the normal help).
    await sendText(chatId, await setGoldReply(message.text))
  } else if (/^\/lang(@\w+)?$/i.test(command)) {
    // /lang km | en | zh — the bot's language for this chat.
    const choice = payload?.toLowerCase()
    if (choice === "km" || choice === "en" || choice === "zh") {
      const { data } = await db.rpc("bot_set_language", { p_key: key, p_chat_id: chatId, p_language: choice })
      await sendText(chatId, data ? tr(choice, "bot.langSet") : tr(choice, "bot.notLinked"))
    } else {
      await sendText(chatId, tr(lang, "bot.langUsage"))
    }
  } else if (command === "/stop") {
    const { data } = await db.rpc("bot_unlink_chat", { p_key: key, p_chat_id: chatId })
    await sendText(chatId, tr(lang, data ? "bot.unlinked" : "bot.notLinked") + SIGNATURE)
  } else {
    // Linked chats: /help shows the logging examples, other text is an entry to confirm.
    const ctx = await botContext(chatId)
    if (!ctx?.linked) await sendText(chatId, tr(lang, "bot.help") + SIGNATURE)
    else if (command.startsWith("/")) {
      const locale = contextLocale(ctx)
      const extras = [transcriptionProvider() && tr(locale, "bot.cmdHelpVoice"), isRouting(ctx) && tr(locale, "bot.cmdHelpRoute")].filter(Boolean)
      await sendText(chatId, [tr(locale, "bot.cmdHelp"), ...extras].join("\n\n"))
    }
    else await handleEntryMessage(chatId, message.text.trim().slice(0, 300), ctx)
  }
  return NextResponse.json({ ok: true })
}
