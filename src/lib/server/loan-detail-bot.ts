// Server only: a mobile-banking LOAN DETAIL screenshot (any Cambodian bank / MFI) → the same loan a
// printed schedule makes (bot_import_loan): the debt, the installments already paid and the monthly
// LOAN reminder. Pure part: src/lib/loans/loan-detail-read.ts.
import { DEFAULT_ABOUT } from "@/lib/app-site"
import { cleanLoanDetail, detailToSchedule, isVehicleLoan, loanDetailPrompt, type LoanDetailRead } from "@/lib/loans/loan-detail-read"
import { importPlan, loanPayload } from "@/lib/loans/schedule-read"
import { formatMoney } from "@/lib/money"
import { logEvent } from "@/lib/server/events"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { botDb, botKey, sendText, telegramFile, tg } from "@/lib/server/telegram-bot"

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const buttons = (car: boolean) => ({
  reply_markup: {
    inline_keyboard: [[{ text: "📱 មើលកម្ចីក្នុងអេប លុយឆ្លាត ↗", url: `${DEFAULT_ABOUT.website}/debts` }], ...(car ? [[{ text: "🚗 រថយន្តរបស់ខ្ញុំ ↗", url: `${DEFAULT_ABOUT.website}/car` }]] : [])],
  },
})
const manual = { reply_markup: { inline_keyboard: [[{ text: "📝 បំពេញទិន្នន័យដោយដៃ", url: `${DEFAULT_ABOUT.website}/debts` }]] } }

/** The screen read by Gemini (Groq while Gemini is busy). Null: not a loan detail / essentials missing; "busy": no reader answered. */
export async function readLoanDetail(fileId: string): Promise<LoanDetailRead | null | "busy"> {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  if (!gemini && !groq) return "busy"
  const file = await telegramFile(fileId)
  if (!file) return null
  const image = Buffer.from(file.bytes).toString("base64")
  const prompt = loanDetailPrompt(phnomPenhToday().day)
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image, prompt, 800, 35_000)])
  if (groq) readers.push(["Groq", () => askGroq(groq, file.type, image, prompt, 800)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "loans", `Loan detail read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      return cleanLoanDetail(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
    } catch {
      logEvent("warn", "loans", `Loan detail read: ${name} answered without JSON`, { fold: true })
    }
  }
  return "busy"
}

export async function handleLoanDetailPhoto(chatId: number, fileId: string) {
  const typing = () => void tg("sendChatAction", { chat_id: chatId, action: "typing" })
  typing()
  const keepTyping = setInterval(typing, 4500)
  let detail: Awaited<ReturnType<typeof readLoanDetail>>
  try {
    detail = await readLoanDetail(fileId)
  } finally {
    clearInterval(keepTyping)
  }
  if (detail === "busy") return sendText(chatId, "⏳ ប្រព័ន្ធអានរូបថតកំពុងរវល់បន្តិច។ សូមផ្ញើរូបថតព័ត៌មានកម្ចីម្ដងទៀតក្នុងពេលបន្តិចទៀត។")
  if (!detail)
    return sendText(
      chatId,
      "🏦 ប្រព័ន្ធអានព័ត៌មានកម្ចីនេះមិនបានគ្រប់ទេ។ សូមថតឱ្យឃើញ៖ ប្រាក់ដើមកម្ចី សមតុល្យនៅសល់ អត្រាការប្រាក់ ថ្ងៃបើក/ថ្ងៃបញ្ចប់ និងថ្ងៃបង់បន្ទាប់ — ឬបំពេញដោយដៃក្នុងអេប លុយឆ្លាត។",
      manual,
    )
  const read = detailToSchedule(detail)
  const plan = importPlan(read, phnomPenhToday().day)
  const { data, error } = await botDb().rpc("bot_import_loan", { p_key: botKey(), p_chat_id: chatId, p_loan: { ...loanPayload(read, plan), note: [detail.account ? `កុង ${detail.account}` : null, `🏦 ពីរូបថតព័ត៌មានកម្ចី (${detail.annualRate}%/ឆ្នាំ)`].filter(Boolean).join(" · ") } })
  if (error) {
    logEvent("error", "loans", `Loan detail import failed: ${error.message}`, { fold: true })
    return sendText(chatId, "🏦 រក្សាទុកកម្ចីមិនបានទេ ពេលនេះ។ សូមព្យាយាមម្ដងទៀត ឬបំពេញដោយដៃក្នុងអេប លុយឆ្លាត។", manual)
  }
  const car = isVehicleLoan(detail.product)
  const r = data as { status: "ok" | "duplicate" | "plan" | "not_linked" }
  if (r.status === "plan") return sendText(chatId, "🏦 ការកត់ត្រាកម្ចីពីរូបថត ជាមុខងារ PRO។ សូមដំឡើងគម្រោង ឬបំពេញដោយដៃក្នុងអេប លុយឆ្លាត។", manual)
  if (r.status === "duplicate") return sendText(chatId, `🏦 កម្ចី ${read.lender} នេះ បានកត់ត្រារួចហើយ — មិនបានបង្កើតម្ដងទៀតទេ។`, buttons(car))
  if (r.status !== "ok") return sendText(chatId, "🏦 សូមភ្ជាប់គណនីជាមុនសិន ដោយប្រើ /start។")
  logEvent("info", "loans", `Loan detail imported (${detail.bank}, ${read.months} months, ${plan.paidCount} paid, next ${detail.nextDue})`, { fold: true })
  const c = detail.currency
  const text = [
    `🏦 កម្ចី ${read.lender} ត្រូវបានកត់ត្រាជោគជ័យ!`,
    ...(detail.account ? [`🔢 គណនី៖ ${detail.account}`] : []),
    `💵 ប្រាក់ដើម៖ ${formatMoney(detail.principal, c)} · អត្រា ${detail.annualRate}%/ឆ្នាំ · ${read.months} ខែ`,
    `⏳ សមតុល្យនៅសល់៖ ${formatMoney(detail.outstanding, c)}`,
    `📅 បង់បន្ទាប់៖ ${ddmmyyyy(detail.nextDue)} — ${formatMoney(read.installment, c)}${read.installmentStated ? "" : " (គណនាតាមប្រាក់ដើម អត្រា និងរយៈពេល — សូមកែក្នុងអេប បើធនាគារកំណត់ខុសពីនេះ)"}`,
    "",
    `ប្រព័ន្ធបានកំណត់រំលឹកបង់ប្រាក់ប្រចាំខែ ក្នុង «វិក្កយបត្រ»${car ? " និង «រថយន្តរបស់ខ្ញុំ»" : ""} រួចរាល់!`,
  ].join("\n")
  const sent = await sendText(chatId, text, buttons(car))
  if (sent.ok) return sent
  return sendText(chatId, `${text}\n\n👉 ${DEFAULT_ABOUT.website}/debts`, { reply_markup: { remove_keyboard: true } })
}
