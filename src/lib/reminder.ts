import { format, parseISO } from "date-fns"

import type { Debt } from "@/lib/data/types"
import { daysLeft, remaining } from "@/lib/debts"
import * as G from "@/lib/islamic/glossary"
import { formatMoney } from "@/lib/money"

export type ReminderLanguage = "km" | "en"

/**
 * Polite, professional reminder for a receivable; the user can still edit it
 * before sending. With `khqr`, it points the debtor to the attached KHQR. In Islamic Mode (`islamic`) it greets with
 * «អាស្សាឡាមុអាឡៃកុម» — never «ជម្រាបសួរ» in an Islamic context (founder, 20/10/2026).
 */
export function buildReminder(debt: Debt, language: ReminderLanguage, khqr = false, islamic = false): string {
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
      `${islamic ? G.ASSALAMU_ALAIKUM : "ជម្រាបសួរ"} ${debt.party_name}! នេះជាសាររំលឹកកាលវិភាគទូទាត់បំណុលចំនួន ${amount}${due}។`,
      khqr ? "លោកអ្នកអាចស្កេនទូទាត់រហ័សតាម KHQR ខាងក្រោមបាន។" : "",
      "សូមអរគុណច្រើន!",
    ]
      .filter(Boolean)
      .join(" ")
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
    `${islamic ? "Assalamu Alaikum" : "Hello"} ${debt.party_name}! This is a friendly reminder about the payment of ${amount}${due}.`,
    khqr ? "You can pay quickly by scanning the KHQR below." : "",
    "Thank you very much!",
  ]
    .filter(Boolean)
    .join(" ")
}

/** Opens Telegram's share screen with the text pre-filled (the user picks the chat and sends). */
export function telegramShareUrl(text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(text)}`
}

/** SMS composer for the debtor's phone, when we have one. */
export function smsUrl(phone: string, text: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(text)}`
}
