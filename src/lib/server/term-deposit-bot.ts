// Server only: a fixed / term deposit screenshot → a savings-goal wallet and a maturity reminder on
// /bills (bot_term_deposit), then the confirmation card. Pure part: src/lib/bot/term-deposit.ts.
import { SITE_URL } from "@/lib/app-site"
import { cleanTermDeposit, depositPayload, depositText, DEPOSIT_PROMPT, type TermDeposit } from "@/lib/bot/term-deposit"
import { logEvent } from "@/lib/server/events"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { botDb, botKey, sendText, telegramFile, tg } from "@/lib/server/telegram-bot"

const manual = { reply_markup: { inline_keyboard: [[{ text: "📝 បំពេញទិន្នន័យដោយដៃ", url: `${SITE_URL}/wallets` }]] } }
const open = { reply_markup: { inline_keyboard: [[{ text: "📱 មើលកាបូបសន្សំ ↗", url: `${SITE_URL}/goals` }, { text: "🧾 ការរំលឹក ↗", url: `${SITE_URL}/bills` }]] } }

async function readDeposit(fileId: string): Promise<TermDeposit | null | "busy"> {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  if (!gemini && !groq) return "busy"
  const file = await telegramFile(fileId)
  if (!file) return null
  const image = Buffer.from(file.bytes).toString("base64")
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image, DEPOSIT_PROMPT)])
  if (groq) readers.push(["Groq", () => askGroq(groq, file.type, image, DEPOSIT_PROMPT)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "deposits", `Deposit read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      return cleanTermDeposit(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
    } catch {
      logEvent("warn", "deposits", `Deposit read: ${name} answered without JSON`, { fold: true })
    }
  }
  return "busy"
}

/** A deposit screenshot in the private chat (the slip reader recognised it). Always answers. */
export async function handleTermDepositPhoto(chatId: number, fileId: string) {
  void tg("sendChatAction", { chat_id: chatId, action: "typing" })
  const d = await readDeposit(fileId)
  if (d === "busy") return sendText(chatId, "⏳ ប្រព័ន្ធអានរូបថតកំពុងរវល់បន្តិច។ សូមផ្ញើរូបថតប្រាក់បញ្ញើម្ដងទៀតក្នុងពេលបន្តិចទៀត។")
  if (!d)
    return sendText(chatId, "🏦 សូមអភ័យទោស ប្រព័ន្ធមិនអាចអានព័ត៌មានប្រាក់បញ្ញើនេះបានច្បាស់ទេ (ប្រាក់ដើម និងថ្ងៃដល់កាលកំណត់)។ សូមថតម្ដងទៀត ឬបញ្ចូលដោយដៃ។", manual)
  const { data, error } = await botDb().rpc("bot_term_deposit", { p_key: botKey(), p_chat_id: chatId, p_dep: depositPayload(d) })
  if (error) {
    logEvent("error", "deposits", `Deposit import failed: ${error.message}`, { fold: true })
    return sendText(chatId, "🏦 រក្សាទុកប្រាក់បញ្ញើមិនបានទេ ពេលនេះ។ សូមព្យាយាមម្ដងទៀត ឬបញ្ចូលដោយដៃក្នុងកម្មវិធី។", manual)
  }
  const r = data as { status: "ok" | "duplicate" | "not_linked"; workspace?: string }
  if (r.status === "not_linked") return sendText(chatId, "🏦 សូមភ្ជាប់គណនីជាមុនសិន ដោយប្រើ /start។")
  if (r.status === "duplicate") return sendText(chatId, `🏦 ប្រាក់បញ្ញើ ${depositPayload(d).wallet_name} នេះ បានកត់ត្រារួចហើយ — មិនបានបង្កើតម្ដងទៀតទេ។`, open)
  logEvent("info", "deposits", `Fixed deposit imported (${d.currency}, matures ${d.maturityDate})`, { fold: true })
  return sendText(chatId, depositText(d, phnomPenhToday().day, r.workspace ?? null), open)
}
