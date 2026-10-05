import type { Currency } from "@/lib/data/types"
import type { GiftDirection, GiftEventType } from "@/lib/gift"

import { parseAmountText, toLatinDigits } from "./parse-entry"

/**
 * Gifts from chat:
 *   ចងដៃការ បងសុខា 50$ ABA           → given, wedding, បងសុខា, $50, from the ABA wallet
 *   បច្ច័យបុណ្យ 100000៛ វត្តចាក់អង្រែ   → given, merit, វត្តចាក់អង្រែ, 100,000៛, record only
 *   គេចងដៃ បងដារ៉ា 30$                 → received
 */
export type ParsedGift = {
  direction: GiftDirection
  eventType: GiftEventType
  person: string
  amount: number
  currency: Currency
  walletId: string | null
  walletName: string | null
  title: string | null
}

const TRIGGER = /^\s*(គេចងដៃការ|គេចងដៃ|ទទួលចំណងដៃ|ចងដៃការ|ចងដៃ|ចំណងដៃ|បច្ច័យបុណ្យ|បច្ច័យ|ធ្វើបុណ្យ|ជូនបុណ្យ|gift(?:\s+received)?)(?=\s|$|[\d០-៩$])/iu

const EVENT_WORD = /^(ឡើងផ្ទះ|ផ្ទះថ្មី|មង្គលការ|រៀបការ|ការ|ខួប|ខួបកំណើត|បុណ្យសព|បុណ្យ|កឋិន|wedding|housewarming|funeral|birthday)$/iu

export const isGiftMessage = (text: string) => TRIGGER.test(text)

function eventOf(text: string): GiftEventType {
  if (/ការ|មង្គល|រៀបការ|wedding/iu.test(text)) return "wedding"
  if (/ឡើងផ្ទះ|ផ្ទះថ្មី|housewarming/iu.test(text)) return "housewarming"
  if (/ខ្មោច|សព|បុណ្យសព|funeral/iu.test(text)) return "funeral"
  if (/ខួប|កំណើត|birthday/iu.test(text)) return "birthday"
  if (/បុណ្យ|វត្ត|បច្ច័យ|ព្រះសង្ឃ|កឋិន|merit|pagoda/iu.test(text)) return "monk_merit"
  return "other"
}

export function parseGiftText(message: string, wallets: { id: string; name: string }[]): ParsedGift | null {
  const text = toLatinDigits(message).trim()
  const trigger = text.match(TRIGGER)
  if (!trigger) return null
  const received = /^(គេចង|ទទួល)|received/iu.test(trigger[1])
  const rest = text.slice(trigger[0].length)
  const amount = parseAmountText(rest)
  if (!amount) return null
  const currency: Currency = amount.currency ?? (amount.value >= 1000 ? "KHR" : "USD")
  let words = `${rest.slice(0, amount.start)} ${rest.slice(amount.end)}`.split(/\s+/).filter(Boolean)

  // A wallet named in the message (longest name first): "ABA", "កាបូប ACLEDA".
  let wallet: { id: string; name: string } | null = null
  for (const w of [...wallets].sort((a, b) => b.name.length - a.name.length)) {
    const parts = w.name.toLowerCase().split(/[\s•*·()-]+/).filter((p) => p.length >= 2 && !/^\d+$/.test(p))
    const hit = words.findIndex((x) => parts.includes(x.toLowerCase()) || x.toLowerCase() === w.name.toLowerCase())
    if (hit >= 0) {
      wallet = w
      words = words.filter((_, i) => i !== hit)
      break
    }
  }
  // Event words on their own ("ឡើងផ្ទះ", "មង្គលការ") are the occasion, not part of the name.
  const occasion = words.filter((x) => EVENT_WORD.test(x))
  const person = words.filter((x) => !EVENT_WORD.test(x)).join(" ").trim()
  if (!person) return null
  return {
    direction: received ? "received" : "given",
    eventType: eventOf(trigger[1] + " " + rest),
    person: person.slice(0, 255),
    amount: currency === "KHR" ? Math.round(amount.value) : Math.round(amount.value * 100) / 100,
    currency,
    walletId: wallet?.id ?? null,
    walletName: wallet?.name ?? null,
    title: occasion.length ? occasion.join(" ").slice(0, 255) : null,
  }
}
