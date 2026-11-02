/**
 * Sign-up and sign-in through @luychlat_bot (founder, 30/10/2026 — «easy for someone who knows nothing»): one button in
 * the bot shares the person's own Telegram number (verified by Telegram), and the bot answers with a one-tap link that
 * opens the app already signed in. A new number gets a phone account (855…@phone.luy.ibmserp.com, the same identity as
 * a phone sign-up in the app) with Telegram already linked; a number that has an account signs it in — so the same
 * button also rescues a forgotten password. A password stays optional (Settings › Security › Change password).
 *
 * The link carries a single-use token in the URL fragment (never sent to a server by a link preview, never logged);
 * /login redeems it (/api/auth/telegram/link → public.bot_signin_redeem) within 15 minutes.
 */
import { PHONE_LOGIN_DOMAIN } from "@/lib/auth-identifier"
import { APP_ORIGIN } from "@/lib/public-origin"

/** How long the one-tap link works (public.bot_contact_account mints it for the same time). */
export const SIGNIN_LINK_MINUTES = 15

/**
 * The account a shared Telegram number belongs to: the phone sign-in address and the local number, or null for a
 * number that is not Cambodian (Telegram sends it in international form, with or without «+»).
 */
export function contactAccount(phoneNumber: string | null | undefined): { email: string; local: string } | null {
  const digits = (phoneNumber ?? "").replace(/\D/g, "")
  const m = /^855([1-9]\d{7,8})$/.exec(digits)
  return m ? { email: `855${m[1]}@${PHONE_LOGIN_DOMAIN}`, local: `0${m[1]}` } : null
}

const TOKEN = /^[0-9a-f]{64}$/

/** The one-tap link the bot sends: the token in the fragment of /login. */
export const signinLink = (token: string) => `${APP_ORIGIN}/login#tgLogin=${token}`

/** The token from /login's fragment, or null (anything malformed is ignored). */
export function signinToken(hash: string | null | undefined): string | null {
  const m = /(?:^#|&)tgLogin=([^&]*)/.exec(hash ?? "")
  const token = m?.[1]?.toLowerCase() ?? ""
  return TOKEN.test(token) ? token : null
}

/** The name a new account starts with: the person's Telegram name, plain, at most 40 characters (as the sign-up form). */
export function telegramName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last]
    .map((s) => [...(s ?? "").replace(/\s+/g, " ")].filter((c) => c >= " " && c !== "<" && c !== ">").join("").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 40)
}

/**
 * The bot's one button for someone not yet linked: shares their own number (a reply keyboard — Telegram asks first).
 * It stays on screen until the number is shared (founder, 2/11/2026 — «someone who barely uses Telegram may get stuck»):
 * a «Cancel» in Telegram's question must never leave them with no button; the answer then takes it away.
 */
export const SIGNUP_BUTTON = "📱 ចុះឈ្មោះ ឬចូល"
export const signupKeyboard = () => ({
  keyboard: [[{ text: SIGNUP_BUTTON, request_contact: true }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "ចុចប៊ូតុងខាងក្រោម 👇",
})

/**
 * Anything else typed or sent before signing up (a number typed by hand, «hello», a photo): not the long welcome again
 * but where to tap, in plain words — the welcome comes with /start.
 */
export const SIGNUP_NUDGE = [
  "👇 សូមចុចប៊ូតុង «📱 ចុះឈ្មោះ ឬចូល» នៅខាងក្រោមអេក្រង់ ជំនួសកន្លែងវាយអក្សរ។",
  "",
  "Telegram នឹងសួរថា «Share your phone number?» — ចុច «Share» ឬ «OK»។ មិនបាច់វាយលេខទូរសព្ទទេ។",
  "",
  "មើលមិនឃើញប៊ូតុង? ចុចរូប ⌨️ ឬ 🎛 តូចៗ ក្បែរកន្លែងវាយអក្សរ ឬវាយ /start ម្តងទៀត។",
].join("\n")

/** The welcome (gateMessage) answers /start; anything else gets the short nudge. */
export const wantsWelcome = (text: string | null | undefined) => /^\/(start|help)(@\w+)?(\s|$)/i.test((text ?? "").trim())

/** The «open the app» button under the bot's answer. */
export const OPEN_BUTTON = "🚀 បើកអេប លុយឆ្លាត"
export const openAppKeyboard = (token: string) => ({ inline_keyboard: [[{ text: OPEN_BUTTON, url: signinLink(token) }]] })

/** What public.bot_contact_account answered. */
export type ContactAccount =
  | { status: "ok"; token: string; created?: boolean }
  | { status: "new"; email: string }
  | { status: "elsewhere" }
  | { status: "foreign" }

/** The bot's answer, in Khmer (the gate is Khmer — founder, 30/10/2026); never a balance, never the number itself. */
export function signupReply(outcome: "created" | "signin" | "elsewhere" | "foreign" | "busy"): string {
  const once = `🔒 តំណនេះប្រើបានតែម្តង ក្នុងរយៈពេល ${SIGNIN_LINK_MINUTES} នាទី។ កុំបញ្ជូនបន្តទៅអ្នកដទៃ។`
  switch (outcome) {
    case "created":
      return [
        "🎉 គណនី «អេប លុយឆ្លាត» របស់អ្នករួចរាល់ហើយ — ឥតគិតថ្លៃ!",
        "",
        "👇 ចុចប៊ូតុង «បើកអេប លុយឆ្លាត» ខាងក្រោម អ្នកចូលរួចភ្លាម មិនបាច់វាយលេខ ឬពាក្យសម្ងាត់ទេ។",
        "",
        "Telegram នេះក៏ភ្ជាប់រួចហើយដែរ៖ ផ្ញើរូបវិក្កយបត្រ ឬនិយាយជាសំឡេងមកទីនេះ ដើម្បីកត់ចំណាយបានភ្លាម។",
        "",
        once,
      ].join("\n")
    case "signin":
      return [
        "✅ យើងស្គាល់លេខរបស់អ្នកហើយ — អ្នកមានគណនីរួចស្រាប់។",
        "",
        "👇 ចុចប៊ូតុង «បើកអេប លុយឆ្លាត» ខាងក្រោម ដើម្បីចូល មិនបាច់វាយពាក្យសម្ងាត់ទេ។",
        "ចង់ដាក់ពាក្យសម្ងាត់ថ្មី? ក្នុងអេប ចុច ការកំណត់ › សុវត្ថិភាព › ប្តូរពាក្យសម្ងាត់។",
        "",
        once,
      ].join("\n")
    case "elsewhere":
      return "⚠️ លេខនេះមានគណនីរួចហើយ ហើយបានភ្ជាប់ជាមួយ Telegram មួយផ្សេងទៀត។ សូមចូលអេបដោយពាក្យសម្ងាត់ នៅ app.luychlat.com ឬសរសេរមកផ្នែកជំនួយក្នុងអេប។"
    case "foreign":
      return "⚠️ ការចុះឈ្មោះតាម Telegram ប្រើបានតែលេខទូរសព្ទកម្ពុជា (+855) ប៉ុណ្ណោះ។ សូមបង្កើតគណនីដោយអ៊ីមែល នៅ app.luychlat.com។"
    case "busy":
      return "⏳ ប្រព័ន្ធរវល់បន្តិច។ សូមចុចប៊ូតុងម្តងទៀត ក្នុងរយៈពេលមួយនាទី។"
  }
}
