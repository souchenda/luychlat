/**
 * A bank account / savings screenshot sent to the bot → one tap adds it as a wallet or a savings
 * goal (founder, 12/10/2026). Pure (account-intake.test.ts); the bot side is
 * lib/server/account-bot.ts. The balance is shown only to chats that turned on «ឱ្យ AI មើលលេខ»
 * (the bot's privacy rule) — otherwise it is masked, yet still used as the wallet's opening balance.
 */
import type { Currency } from "@/lib/data/types"
import { formatMoney } from "@/lib/money"
import { latinDigits } from "@/lib/moc-fuel"

export type AccountIntake = { name: string; bank: string | null; accountName: string | null; accountNo: string | null; balance: number | null; currency: Currency }

/** «🏦 រកឃើញគណនីសន្សំ Amret Kmeng Chhlat $1,250.50!» + the question. */
export function accountIntakeText(a: AccountIntake, showNumbers: boolean): string {
  const who = [a.bank, a.accountName].filter(Boolean).join(" ") || a.name
  const amount = a.balance === null ? null : showNumbers ? formatMoney(a.balance, a.currency) : "••••"
  return [
    `🏦 រកឃើញគណនីសន្សំ ${who}${amount ? ` ${amount}` : ""}!`,
    ...(a.accountNo ? [`🔢 លេខគណនី៖ ${a.accountNo}`] : []),
    "តើចង់កត់ត្រាចូលកាបូប ឬគោលដៅសន្សំ?",
    "",
    "• 👛 កាបូប៖ សមតុល្យក្នុងរូបថត ក្លាយជាសមតុល្យដើម",
    "• 🎯 គោលដៅសន្សំ៖ វាយចំនួនគោលដៅ — គោលដៅចាប់ផ្តើមពី ០ (ផ្ទេរលុយចូលពីកាបូបក្នុងអេប)",
  ].join("\n")
}

export function accountIntakeButtons(id: string) {
  return {
    inline_keyboard: [
      [
        { text: "👛 កាបូប", callback_data: `ac:${id}:w` },
        { text: "🎯 គោលដៅសន្សំ", callback_data: `ac:${id}:g` },
      ],
      [{ text: "✖️ ទេ អរគុណ", callback_data: `ac:${id}:x` }],
    ],
  }
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
export const isAccountCallback = (data: string | undefined) => new RegExp(`^ac:${UUID}:[wgx]$`).test(data ?? "")
export function parseAccountCallback(data: string | undefined): { id: string; action: "wallet" | "goal" | "dismiss" } | null {
  const m = new RegExp(`^ac:(${UUID}):([wgx])$`).exec(data ?? "")
  return m ? { id: m[1], action: m[2] === "w" ? "wallet" : m[2] === "g" ? "goal" : "dismiss" } : null
}

/** The goal amount typed in reply: «5000», «5,000», «៥០០០», «$5000», «5000$». Null when not a positive amount. */
export function parseGoalTarget(text: string): number | null {
  const t = latinDigits(text).replace(/[\s,$៛]/g, "").replace(/(usd|riel|រៀល|ដុល្លារ)$/i, "")
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n < 1e12 ? n : null
}
