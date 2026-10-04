import type { Currency } from "@/lib/data/types"
import type { InvoiceItem } from "@/lib/invoice"

import { parseAmountText, toLatinDigits } from "./parse-entry"

/**
 * Quick invoices from chat:
 *   /invoice 12$ កាហ្វេ 2 នំបុ័ង 1
 *   គិតលុយ 12$ កាហ្វេ 2កែវ នំបុ័ង 1   → $12, items កាហ្វេ ×2, នំបុ័ង ×1
 *   invoice 25$ បងសុខា ថ្លៃទំនិញ       → $25, customer បងសុខា, note ថ្លៃទំនិញ
 *   វិក្កយបត្រ 40000៛ ថ្លៃសេវា           → 40,000៛, note ថ្លៃសេវា
 */
export type ParsedInvoice =
  | { ok: true; total: number; currency: Currency; customer: string | null; items: InvoiceItem[]; notes: string | null }
  | { ok: false; reason: "no_amount" }

const TRIGGER = /^\s*(?:\/invoice(?:@\w+)?|invoice|receipt|គិតលុយ|វិក្កយបត្រ|វិក័យប័ត្រ|វិក្ក័យប័ត្រ|发票|开票|收据)(?=\s|$|[\d០-៩$])/iu

/** True when the message asks for an invoice. */
export const isInvoiceRequest = (text: string) => TRIGGER.test(text)

// Words before a name: "បងសុខា", "បង សុខា", "លោក Dara", "for Dara".
// Glued to the name only for these ("បង់" = pay is not "បង"); short ones ("ពូ", "តា") only as a separate word.
const GLUED = /^(?:បង(?!់)|អ្នកស្រី|អ្នកនាង|លោកស្រី|លោកគ្រូ|អ្នកគ្រូ|លោក|ប្អូន)(?=\S)/u
const BARE = /^(?:បង|អ្នក|អ្នកស្រី|អ្នកនាង|លោក|លោកស្រី|ប្អូន|ពូ|មីង|អ៊ំ|យាយ|តា|ម៉ាក់|mr\.?|mrs\.?|ms\.?|miss)$/iu
const NAME_LEAD = /^(?:for|to|ជូន|សម្រាប់|给)$/iu
// "2", "2កែវ", "x2", "×2", "2pcs"
const QTY = /^[x×]?(\d+(?:\.\d+)?)(?:[^\d\s]{0,8})$/iu

export function parseInvoiceText(message: string): ParsedInvoice {
  const text = toLatinDigits(message).replace(TRIGGER, " ").trim()
  const amount = parseAmountText(text)
  if (!amount) return { ok: false, reason: "no_amount" }
  const currency: Currency = amount.currency ?? (amount.value >= 1000 ? "KHR" : "USD")
  const total = currency === "KHR" ? Math.round(amount.value) : Math.round(amount.value * 100) / 100
  const rest = `${text.slice(0, amount.start)} ${text.slice(amount.end)}`
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)

  // Customer: an honorific + name ("បងសុខា" or "បង សុខា"), or "for Dara".
  let customer: string | null = null
  for (let i = 0; i < rest.length && !customer; i++) {
    const word = rest[i]
    if (NAME_LEAD.test(word) && rest[i + 1]) {
      customer = rest[i + 1]
      rest.splice(i, 2)
    } else if (BARE.test(word) && rest[i + 1] && !QTY.test(rest[i + 1])) {
      customer = `${word} ${rest[i + 1]}`
      rest.splice(i, 2)
    } else if (GLUED.test(word)) {
      customer = word
      rest.splice(i, 1)
    }
  }

  // Items: names followed by a quantity ("កាហ្វេ 2កែវ", "នំបុ័ង 1"); a name glued to its quantity ("កាហ្វេ2") too.
  const items: InvoiceItem[] = []
  let name: string[] = []
  for (const word of rest) {
    const glued = word.match(/^(\D+?)(\d+(?:\.\d+)?)(\D{0,8})$/u)
    const qty = word.match(QTY)
    if (qty && name.length) {
      items.push({ name: name.join(" ").slice(0, 80), qty: Number(qty[1]) })
      name = []
    } else if (glued && !qty && !/^[x×]$/i.test(glued[1])) {
      items.push({ name: [...name, glued[1]].join(" ").slice(0, 80), qty: Number(glued[2]) })
      name = []
    } else {
      name.push(word)
    }
  }
  // Words left over (or a message without quantities) are the note.
  const leftover = name.join(" ").trim()
  const notes = leftover ? leftover.slice(0, 500) : null
  return { ok: true, total, currency, customer: customer?.slice(0, 255) ?? null, items: items.slice(0, 50), notes }
}
