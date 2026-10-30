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

/** The note for someone who knows nothing about the app (founder, 30/10/2026): what it is, what it helps with, three easy steps, then the free sign-up button. The name is the person's Telegram first name (plain text, never HTML). */
export function gateMessage(name: string | null | undefined): string {
  const who = (name ?? "").replace(/\s+/g, " ").trim().slice(0, 40)
  return [
    `ជម្រាបសួរ${who ? ` ${who}` : ""}! 🙏`,
    "",
    "នេះជាបូតរបស់ «អេប លុយឆ្លាត» — សៀវភៅកត់លុយក្នុងទូរសព្ទ សម្រាប់គ្រួសារខ្មែរ។",
    "",
    "📒 អេប លុយឆ្លាត ជាអ្វី?",
    "ជាកន្លែងកត់ថាលុយចូលប៉ុន្មាន លុយចេញប៉ុន្មាន។ ឥតគិតថ្លៃ។ វាមិនមែនជាធនាគារទេ ហើយមិនដែលសុំកូដ OTP ពីអ្នកឡើយ។",
    "",
    "✅ វាជួយអ្នកអ្វីខ្លះ?",
    "• ដឹងថាចុងខែ លុយទៅណាអស់",
    "• កត់ចំណាយបានលឿន គ្រាន់តែនិយាយ ឬថតរូបវិក្កយបត្រ",
    "• រំលឹកថ្ងៃត្រូវបង់ថ្លៃអគ្គិសនី ទឹក ឬកម្ចី កុំឱ្យភ្លេច",
    "• មើលលុយទាំងអស់របស់អ្នក នៅកន្លែងតែមួយ",
    "",
    "📲 ចុះឈ្មោះងាយៗ ៣ ជំហាន៖",
    "1. ចុចប៊ូតុង «បង្កើតគណនីឥតគិតថ្លៃ» ខាងក្រោម",
    "2. ដាក់លេខទូរសព្ទ និងពាក្យសម្ងាត់ដែលអ្នកចាំបាន",
    "3. ក្នុងអេប ចុច ការកំណត់ (Settings) › «ភ្ជាប់ Telegram» រួចត្រឡប់មកទីនេះ ប្រើបូតបានភ្លាម",
    "",
    "ត្រឹមតែប៉ុន្មាននាទីប៉ុណ្ណោះ អ្នកនឹងចាប់ផ្តើមបាន។ រីករាយស្វាគមន៍មកកាន់គ្រួសារលុយឆ្លាត! 🐰✨",
  ].join("\n")
}

export const gateKeyboard = () => ({ inline_keyboard: [[{ text: "📱 បង្កើតគណនីឥតគិតថ្លៃ", url: SIGNUP_URL }]] })

/** The short alert for a button tapped in an unlinked private chat (Telegram caps it at 200 characters). */
export const GATE_ALERT = "បូតនេះសម្រាប់សមាជិក «អេប លុយឆ្លាត» ប៉ុណ្ណោះ — សូមបង្កើតគណនីឥតគិតថ្លៃនៅ app.luychlat.com ហើយភ្ជាប់ Telegram។"
