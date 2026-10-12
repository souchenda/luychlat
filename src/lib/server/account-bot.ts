// Server only: a bank account / savings screenshot in the bot's private chat (e.g. Amret
// «Kmeng Chhlat») → «🏦 រកឃើញគណនីសន្សំ …! តើចង់កត់ត្រាចូលកាបូប ឬគោលដៅសន្សំ?» with one tap:
//   👛 កាបូប       a wallet — the bank's logo, the account's name and number, the balance as its opening balance
//   🎯 គោលដៅសន្សំ  a goal — the target typed in reply; it starts at 0, as in the app
// Pure part: src/lib/bot/account-intake.ts. Reading: the same prompt as the app's scan bar (lib/scan.ts).
import { DEFAULT_ABOUT } from "@/lib/app-site"
import { accountIntakeButtons, accountIntakeText, parseAccountCallback, parseGoalTarget, type AccountIntake } from "@/lib/bot/account-intake"
import { ACCOUNT_PROMPT, accountTitle, cleanAccount, type AccountRead } from "@/lib/scan"
import { getProvider } from "@/lib/wallets/providers"
import { logEvent } from "@/lib/server/events"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { botDb, botKey, sendText, telegramFile, tg } from "@/lib/server/telegram-bot"

const openApp = (path: string, label: string) => ({ reply_markup: { inline_keyboard: [[{ text: `${label} ↗`, url: `${DEFAULT_ABOUT.website}${path}` }]] } })

/** The screen read by Gemini (Groq while Gemini is busy). Null: not an account screen; "busy": no reader answered. */
async function readAccount(fileId: string): Promise<AccountRead | null | "busy"> {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  if (!gemini && !groq) return "busy"
  const file = await telegramFile(fileId)
  if (!file) return null
  const image = Buffer.from(file.bytes).toString("base64")
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image, ACCOUNT_PROMPT, 400, 30_000)])
  if (groq) readers.push(["Groq", () => askGroq(groq, file.type, image, ACCOUNT_PROMPT, 400)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "accounts", `Account screen read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      return cleanAccount(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
    } catch {
      logEvent("warn", "accounts", `Account screen read: ${name} answered without JSON`, { fold: true })
    }
  }
  return "busy"
}

export async function handleAccountPhoto(chatId: number, fileId: string) {
  const typing = () => void tg("sendChatAction", { chat_id: chatId, action: "typing" })
  typing()
  const keepTyping = setInterval(typing, 4500)
  let a: Awaited<ReturnType<typeof readAccount>>
  try {
    a = await readAccount(fileId)
  } finally {
    clearInterval(keepTyping)
  }
  if (a === "busy") return sendText(chatId, "⏳ ប្រព័ន្ធអានរូបថតកំពុងរវល់បន្តិច។ សូមផ្ញើរូបថតគណនីម្ដងទៀតក្នុងពេលបន្តិចទៀត។")
  if (!a) return sendText(chatId, "🏦 ប្រព័ន្ធអានគណនីនេះមិនបានគ្រប់ទេ។ សូមថតឱ្យឃើញឈ្មោះធនាគារ ឈ្មោះគណនី និងសមតុល្យ — ឬបន្ថែមដោយដៃក្នុងអេប លុយឆ្លាត។", openApp("/wallets", "👛 បន្ថែមកាបូប"))
  const provider = a.icon !== "other" ? getProvider(a.icon) : null
  const intake: AccountIntake = { name: accountTitle(a, provider?.name.en ?? null) || "គណនីធនាគារ", bank: provider?.name.en ?? a.bank, accountName: a.accountName, accountNo: a.accountNo, balance: a.balance, currency: a.currency }
  const { data, error } = await botDb().rpc("bot_account_pending_save", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_payload: { name: intake.name, icon: a.icon === "other" ? null : a.icon, account_no: a.accountNo, balance: a.balance, currency: a.currency, bank: intake.bank, account_name: a.accountName },
  })
  if (error || !data) {
    logEvent("error", "accounts", `Account intake not saved: ${error?.message ?? "no answer"}`, { fold: true })
    return sendText(chatId, "🏦 រក្សាទុកមិនបានទេ ពេលនេះ។ សូមព្យាយាមម្ដងទៀត ឬបន្ថែមក្នុងអេប លុយឆ្លាត។", openApp("/wallets", "👛 បន្ថែមកាបូប"))
  }
  const saved = data as { id: string; show_numbers: boolean }
  return sendText(chatId, accountIntakeText(intake, saved.show_numbers), { reply_markup: accountIntakeButtons(saved.id) })
}

type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }

const STATUS_TEXT: Record<string, string> = {
  duplicate: "ℹ️ គណនីនេះមានក្នុងអេប លុយឆ្លាត រួចហើយ — មិនបានបង្កើតម្ដងទៀតទេ។",
  gone: "ℹ️ សំណើនេះបានប្រើ ឬផុតកំណត់ហើយ។ សូមផ្ញើរូបថតម្ដងទៀត។",
  limit: "🔒 គម្រោងបច្ចុប្បន្នបានដល់ចំនួនកាបូបអតិបរមាហើយ។ សូមដំឡើងគម្រោង ឬរៀបចំកាបូបក្នុងអេប។",
  not_linked: "🔗 សូមភ្ជាប់គណនីជាមុនសិន ដោយប្រើ /start។",
}

async function add(chatId: number, id: string, as: "WALLET" | "GOAL", target: number | null) {
  const { data, error } = await botDb().rpc("bot_account_add", { p_key: botKey(), p_chat_id: chatId, p_id: id, p_as: as, p_target: target })
  if (error) {
    logEvent("error", "accounts", `Account add failed: ${error.message}`, { fold: true })
    const why = /commands_off/.test(error.message) ? "⚙️ ការកត់ត្រាតាម Telegram ត្រូវបានបិទ — សូមបើកក្នុងអេប › ការកំណត់ › Telegram។" : /not_writable/.test(error.message) ? "🔒 អ្នកមិនមានសិទ្ធិកែ workspace នេះទេ។" : "🏦 រក្សាទុកមិនបានទេ ពេលនេះ។ សូមព្យាយាមម្ដងទៀត។"
    return sendText(chatId, why)
  }
  const r = data as { status: string; name?: string }
  if (r.status !== "ok") return sendText(chatId, STATUS_TEXT[r.status] ?? STATUS_TEXT.gone, openApp(as === "GOAL" ? "/goals" : "/wallets", as === "GOAL" ? "🎯 មើលគោលដៅ" : "👛 មើលកាបូប"))
  logEvent("info", "accounts", `Account screenshot added as ${as.toLowerCase()}`, { fold: true })
  return as === "WALLET"
    ? sendText(chatId, `✅ បានបន្ថែមកាបូប «${r.name}» ជាមួយសមតុល្យដើមពីរូបថត។`, openApp("/wallets", "👛 មើលកាបូប"))
    : sendText(chatId, `✅ បានបង្កើតគោលដៅសន្សំ «${r.name}»! គោលដៅចាប់ផ្តើមពី ០ — ផ្ទេរលុយចូលពីកាបូបក្នុងអេប លុយឆ្លាត។`, openApp("/goals", "🎯 មើលគោលដៅ"))
}

/** 👛 / 🎯 / ✖️ under the reading. */
export async function handleAccountCallback(cb: Callback) {
  const answer = (text = "") => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) })
  const parsed = parseAccountCallback(cb.data)
  const chat = cb.message?.chat
  if (!parsed || !chat || chat.type !== "private") return answer()
  // The buttons go once tapped — the reading is used (or dismissed) only once.
  await tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
  if (parsed.action === "dismiss") {
    await botDb().rpc("bot_account_dismiss", { p_key: botKey(), p_chat_id: chat.id, p_id: parsed.id })
    return answer("✖️ មិនបានកត់ត្រាទេ")
  }
  await answer()
  if (parsed.action === "wallet") return add(chat.id, parsed.id, "WALLET", null)
  // A goal needs its target: ask for it as a reply.
  const { data: payload } = await botDb().rpc("bot_account_pending_get", { p_key: botKey(), p_chat_id: chat.id, p_id: parsed.id })
  if (!payload) return sendText(chat.id, STATUS_TEXT.gone)
  const currency = (payload as { currency?: string }).currency === "KHR" ? "KHR" : "USD"
  const sent = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chat.id,
    text: `🎯 សូម Reply សារនេះដោយចំនួនគោលដៅ (${currency === "KHR" ? "៛" : "$"}) — ឧ. ${currency === "KHR" ? "20000000" : "5000"}`,
    reply_markup: { force_reply: true, input_field_placeholder: currency === "KHR" ? "20000000" : "5000" },
  })
  if (sent.ok && sent.result) await botDb().rpc("bot_account_pending_prompt", { p_key: botKey(), p_chat_id: chat.id, p_id: parsed.id, p_msg: sent.result.message_id })
}

/** A reply to the «ចំនួនគោលដៅ» prompt → the goal. False when the message isn't a reply to one. */
export async function handleAccountGoalReply(chatId: number, replyTo: number, text: string | undefined): Promise<boolean> {
  const { data: id } = await botDb().rpc("bot_account_by_prompt", { p_key: botKey(), p_chat_id: chatId, p_msg: replyTo })
  if (typeof id !== "string") return false
  const target = parseGoalTarget(text ?? "")
  if (!target) {
    await sendText(chatId, "🔢 សូមវាយតែចំនួនលុយ ឧ. 5000 (Reply សារមុនម្ដងទៀត)។")
    return true
  }
  await add(chatId, id, "GOAL", target)
  return true
}
