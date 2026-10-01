import { format, parseISO } from "date-fns"

import type { Debt } from "@/lib/data/types"
import { daysLeft, remaining } from "@/lib/debts"
import { formatMoney } from "@/lib/money"

export type ReminderLanguage = "km" | "en"

/** Polite reminder for a receivable; the user can still edit it before sending. */
export function buildReminder(debt: Debt, language: ReminderLanguage): string {
  const amount = formatMoney(remaining(debt), debt.currency)
  const date = debt.due_date ? format(parseISO(debt.due_date), "dd/MM/yyyy") : null
  const days = daysLeft(debt)

  if (language === "km") {
    const due =
      date === null
        ? ""
        : days !== null && days > 0
          ? ` ដែលត្រូវដល់ថ្ងៃកំណត់នៅថ្ងៃទី ${date}`
          : days === 0
            ? ` ដែលដល់ថ្ងៃកំណត់នៅថ្ងៃនេះ (${date})`
            : ` ដែលបានហួសថ្ងៃកំណត់តាំងពីថ្ងៃទី ${date}`
    return [
      `សួស្តី ${debt.party_name}! 🙏`,
      `ខ្ញុំគ្រាន់តែសូមរំលឹកដោយក្តីរាប់អានពីប្រាក់នៅខ្វះចំនួន ${amount}${due}។`,
      `ពេលណាងាយស្រួល សូមជួយផ្ញើមកផង។ សូមអរគុណច្រើន! 😊`,
    ].join("\n")
  }

  const due =
    date === null
      ? ""
      : days !== null && days > 0
        ? `, due on ${date}`
        : days === 0
          ? `, due today (${date})`
          : `, which was due on ${date}`
  return [
    `Hi ${debt.party_name}! 🙏`,
    `Just a friendly reminder about the remaining ${amount}${due}.`,
    `Whenever it's convenient for you. Thank you so much! 😊`,
  ].join("\n")
}

/** Opens Telegram's share screen with the text pre-filled (the user picks the chat and sends). */
export function telegramShareUrl(text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(text)}`
}

/** SMS composer for the debtor's phone, when we have one. */
export function smsUrl(phone: string, text: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(text)}`
}
