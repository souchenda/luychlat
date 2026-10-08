/**
 * Prepaid service wallets (closed-loop balances): an EV charging app (EVX, Charge+…)
 * and the Phnom Penh – Sihanoukville Expressway ANPR toll account. Each is a USD
 * wallet marked by its icon. Shared by the entry parser and the top-up parser. Pure.
 */

export type PrepaidType = "EV" | "TOLL"

export const PREPAID_ICON: Record<PrepaidType, string> = { EV: "prepaid_ev", TOLL: "prepaid_toll" }
export const PREPAID_NAME: Record<PrepaidType, string> = {
  EV: "កាបូបសាកឡាន (EV App Wallet)",
  TOLL: "កាបូបផ្លូវល្បឿនលឿន (Expressway ANPR)",
}
export const isPrepaidIcon = (icon: string | null | undefined) => icon === PREPAID_ICON.EV || icon === PREPAID_ICON.TOLL

/** Tag on an expressway toll's note (as "⚡ សាកភ្លើង EV" on public charging). */
export const TOLL_TAG = "🛣️ ផ្លូវល្បឿនលឿន"

const TOLL = /ល្បឿនលឿន|ផ្លូវល្បឿន|(^|[^a-z])(expressway|anpr|toll)($|[^a-z])/i
const EV = /សាកឡាន|សាកភ្លើង|សាកថ្ម|(^|[^a-z])(ev|evx|charge\+?|charging)($|[^a-z])/i

/** Which prepaid service a message is about (the expressway first: "ល្បឿនលឿន" never means charging). */
export function prepaidTypeOf(text: string): PrepaidType | null {
  if (TOLL.test(text)) return "TOLL"
  if (EV.test(text)) return "EV"
  return null
}
