// Server only: a photo of a loan repayment schedule → the loan, its installments already paid and a
// monthly LOAN bill, saved in one go (bot_import_loan), then the confirmation. Pure part:
// src/lib/loans/schedule-read.ts.
import { DEFAULT_ABOUT } from "@/lib/app-info"
import { cleanScheduleRead, importedText, importPlan, loanPayload, schedulePrompt, type ScheduleRead } from "@/lib/loans/schedule-read"
import { logEvent } from "@/lib/server/events"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { botDb, botKey, sendText, telegramFile, tg } from "@/lib/server/telegram-bot"

const openDebts = { reply_markup: { inline_keyboard: [[{ text: "📱 មើលកាលវិភាគក្នុងកម្មវិធី ↗", url: `${DEFAULT_ABOUT.website}/debts` }]] } }
const manual = { reply_markup: { inline_keyboard: [[{ text: "📝 បំពេញទិន្នន័យដោយដៃ", url: `${DEFAULT_ABOUT.website}/debts` }]] } }

/** The schedule on the photo: Gemini first, Groq while Gemini is busy. Null: not a schedule / unreadable; "busy": no reader answered. */
export async function readLoanSchedule(fileId: string): Promise<ScheduleRead | null | "busy"> {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  if (!gemini && !groq) return "busy"
  const file = await telegramFile(fileId)
  if (!file) return null
  const image = Buffer.from(file.bytes).toString("base64")
  const prompt = schedulePrompt(phnomPenhToday().day)
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image, prompt)])
  if (groq) readers.push(["Groq", () => askGroq(groq, file.type, image, prompt)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "loans", `Loan schedule read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      return cleanScheduleRead(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
    } catch {
      logEvent("warn", "loans", `Loan schedule read: ${name} answered without JSON`, { fold: true })
    }
  }
  return "busy"
}

/** A schedule photo in the private chat (the slip reader recognised it, or the caption said so). */
export async function handleLoanSchedulePhoto(chatId: number, fileId: string) {
  const typing = () => void tg("sendChatAction", { chat_id: chatId, action: "typing" })
  typing()
  const keepTyping = setInterval(typing, 4500)
  let read: Awaited<ReturnType<typeof readLoanSchedule>>
  try {
    read = await readLoanSchedule(fileId)
  } finally {
    clearInterval(keepTyping)
  }
  if (read === "busy") return sendText(chatId, "⏳ ប្រព័ន្ធអានរូបថតកំពុងរវល់បន្តិច។ សូមផ្ញើរូបថតតារាងកាលវិភាគម្ដងទៀតក្នុងពេលបន្តិចទៀត។")
  if (!read)
    return sendText(
      chatId,
      "📑 សូមអភ័យទោស ប្រព័ន្ធមិនអាចអានតារាងកាលវិភាគកម្ចីនេះបានច្បាស់ទេ។ សូមថតឱ្យឃើញផ្នែកខាងលើ (ប្រាក់ដើម អត្រាការប្រាក់ រយៈពេល) និងជួរទីមួយនៃតារាង ឬបំពេញដោយដៃក្នុងកម្មវិធី។",
      manual,
    )
  const plan = importPlan(read, phnomPenhToday().day)
  const { data, error } = await botDb().rpc("bot_import_loan", { p_key: botKey(), p_chat_id: chatId, p_loan: loanPayload(read, plan) })
  if (error) {
    logEvent("error", "loans", `Loan import failed: ${error.message}`, { fold: true })
    return sendText(chatId, "📑 រក្សាទុកកម្ចីមិនបានទេ ពេលនេះ។ សូមព្យាយាមម្ដងទៀត ឬបំពេញដោយដៃក្នុងកម្មវិធី។", manual)
  }
  const r = data as { status: "ok" | "duplicate" | "plan" | "not_linked" }
  if (r.status === "plan") return sendText(chatId, "📑 កាលវិភាគបង់រំលស់កម្ចី ជាមុខងារ PRO។ សូមដំឡើងគម្រោង ដើម្បីឱ្យប្រព័ន្ធកត់ត្រាតារាងកាលវិភាគដោយស្វ័យប្រវត្តិ។", openDebts)
  if (r.status === "duplicate") return sendText(chatId, `📑 កម្ចី ${read.lender} នេះ បានកត់ត្រារួចហើយ — មិនបានបង្កើតម្ដងទៀតទេ។`, openDebts)
  if (r.status !== "ok") return sendText(chatId, "📑 សូមភ្ជាប់គណនីជាមុនសិន ដោយប្រើ /start។")
  logEvent("info", "loans", `Loan schedule imported (${read.months} months, ${plan.paidCount} paid)`, { fold: true })
  return sendText(chatId, importedText(read, plan), openDebts)
}
