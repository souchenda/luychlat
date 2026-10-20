/**
 * The members-only gate for @luychlat_bot (founder, 20/10/2026): in a private chat the bot serves only people whose
 * Telegram is linked to an «អេប លុយឆ្លាត» account. Anyone else gets one polite note and the sign-up button — no OCR,
 * no logging, no commands. Groups (LCA Approval, shared pools, business groups) and channels are never gated here.
 *
 * Let through without a link: the app's own deep links — `/start <32-hex link code>` (connecting Telegram from
 * Settings) and `/start reset_<32-hex>` with the contact share that follows it (forgot password).
 */

export const SIGNUP_URL = "https://app.luychlat.com"

export type GateInput = {
  chatType: string | undefined
  /** The message text (or a tapped button's label), if any. */
  text?: string | null
  /** The person shared a contact (the password-reset step). */
  contact?: boolean
  /** From the bot context: null when the lookup itself failed. */
  linked: boolean | null
}

/** "pass" — handle as usual; "gate" — the polite note; "quiet" — the lookup failed: say nothing, do nothing. */
export type GateDecision = "pass" | "gate" | "quiet"

const LINK_START = /^\/start(@\w+)?\s+(reset_)?[0-9a-fA-F]{32}\s*$/

/** A deep link from the app that must reach the bot before the chat is linked. */
export const isAppDeepLink = (text: string | null | undefined) => LINK_START.test((text ?? "").trim())

export function gateDecision(input: GateInput): GateDecision {
  if (input.chatType !== "private") return "pass"
  if (isAppDeepLink(input.text) || input.contact) return "pass"
  if (input.linked === null) return "quiet"
  return input.linked ? "pass" : "gate"
}

/** The note, in the founder's words. The name is the person's Telegram first name (plain text, never HTML). */
export function gateMessage(name: string | null | undefined): string {
  const who = (name ?? "").replace(/\s+/g, " ").trim().slice(0, 40)
  return [
    `ជម្រាបសួរ${who ? ` ${who}` : ""}! 🙏`,
    "",
    "សូមអភ័យទោសផងបាទ បច្ចុប្បន្នបូត លុយឆ្លាត បម្រើជូនផ្តាច់មុខសម្រាប់តែសមាជិកដែលមានគណនីនៅលើ «អេប លុយឆ្លាត» ប៉ុណ្ណោះ។",
    "",
    "💡 ដើម្បីប្រើប្រាស់មុខងារបូត (ស្កេនវិក្កយបត្រ កត់ត្រាចំណាយ និងតាមដានលុយកាក់) ងាយៗ៖",
    "១. សូមចូលទៅបង្កើតគណនីឥតគិតថ្លៃលើអេប 👉 app.luychlat.com",
    "២. ចូលទៅកាន់ ការកំណត់ (Settings) › ជ្រើសរើស «ភ្ជាប់ Telegram»",
    "",
    "ត្រឹមតែប៉ុន្មានវិនាទីប៉ុណ្ណោះ លោកអ្នកនឹងអាចប្រើប្រាស់បូតនេះបានភ្លាមៗ! រីករាយស្វាគមន៍មកកាន់គ្រួសារលុយឆ្លាត! 🐰✨",
  ].join("\n")
}

export const gateKeyboard = () => ({ inline_keyboard: [[{ text: "📱 បង្កើតគណនីឥតគិតថ្លៃ", url: SIGNUP_URL }]] })

/** The short alert for a button tapped in an unlinked private chat (Telegram caps it at 200 characters). */
export const GATE_ALERT = "បូតនេះសម្រាប់សមាជិក «អេប លុយឆ្លាត» ប៉ុណ្ណោះ — សូមបង្កើតគណនីឥតគិតថ្លៃនៅ app.luychlat.com ហើយភ្ជាប់ Telegram។"
