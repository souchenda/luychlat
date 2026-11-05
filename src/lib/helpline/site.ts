import { classify, KIND_REPLY, KNOWLEDGE, QUICK_IDS, wantsHuman, type HelpEntry } from "@/lib/helpline/knowledge"

/**
 * The helpline on luychlat.com (founder, 4–5/11/2026 — «in the app, on the website and on the sign-in page»): the same
 * approved knowledge and the same on-the-subject rules as the in-app chat (knowledge.ts), shaped for a visitor who is not
 * signed in — an app screen becomes a link into the app, «upgrade» becomes the prices; what it can't answer goes to the
 * team with a way to reach the visitor (a phone number or a Telegram username). Pure (site.test.ts).
 */
export type SiteLang = "km" | "en"
export type SiteLink = { href: string; label: string }
export type SiteEntry = { id: string; q: string; a: string[]; link?: SiteLink }
export type SiteReply =
  | { kind: "answer"; entry: SiteEntry; more: SiteEntry[] }
  | { kind: "human" | "ontopic"; text: string; offerHuman: true }
  | { kind: "greeting" | "thanks" | "advice" | "offtopic"; text: string; more: SiteEntry[] }

/** The website speaks Khmer, English and Chinese; the knowledge is Khmer and English (Chinese readers get English). */
export const siteLang = (lang: unknown): SiteLang => (lang === "km" ? "km" : "en")

const APP = "https://app.luychlat.com"
const PRICES: Record<SiteLang, SiteLink> = {
  km: { href: "https://luychlat.com/#pricing", label: "មើលតម្លៃ" },
  en: { href: "https://luychlat.com/en/#pricing", label: "See the prices" },
}

export function siteEntry(e: HelpEntry, lang: SiteLang): SiteEntry {
  const out: SiteEntry = { id: e.id, q: e.q[lang], a: e.a.map((p) => p[lang]) }
  if (e.action === "upgrade") out.link = PRICES[lang]
  else if (e.action && typeof e.action === "object") out.link = { href: APP + e.action.href, label: e.action.label[lang] }
  return out
}

const quick = (lang: SiteLang, skip?: string, n = QUICK_IDS.length) =>
  QUICK_IDS.filter((id) => id !== skip)
    .slice(0, n)
    .map((id) => KNOWLEDGE.find((k) => k.id === id))
    .filter((e): e is HelpEntry => Boolean(e))
    .map((e) => siteEntry(e, lang))

export const siteQuick = (lang: SiteLang) => quick(lang)

export const SITE_TEXT = {
  unknown: { km: "សំណួរនេះ យើងសូមផ្ញើទៅក្រុមការងារ ដើម្បីឆ្លើយលោកអ្នកឱ្យបានច្បាស់លាស់។", en: "We'd like our team to answer this one properly." },
  toHuman: { km: "បាទ/ចាស ក្រុមការងាររបស់យើងរីករាយនិយាយជាមួយលោកអ្នក។", en: "Of course, our team would be glad to talk with you." },
} as const

/** The reply to a typed question: by the same rules as the app's chat (classify). */
export function siteReply(text: string, lang: SiteLang): SiteReply {
  const q = text.trim().slice(0, 300)
  if (wantsHuman(q)) return { kind: "human", text: SITE_TEXT.toHuman[lang], offerHuman: true }
  const c = classify(q)
  if (c.kind === "answer" && c.entry) return { kind: "answer", entry: siteEntry(c.entry, lang), more: quick(lang, c.entry.id, 3) }
  if (c.kind === "ontopic" || c.kind === "answer") return { kind: "ontopic", text: SITE_TEXT.unknown[lang], offerHuman: true }
  return { kind: c.kind, text: KIND_REPLY[c.kind][lang], more: quick(lang, undefined, 4) }
}

/**
 * How the team reaches a visitor: a Cambodian phone number (0… or +855…, 8–10 digits after the 0) or a Telegram username
 * (@name, 5–32 letters, digits or _). Returns the cleaned contact, or null.
 */
export function siteContact(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim()
  const tgName = s.match(/^@?([A-Za-z][A-Za-z0-9_]{4,31})$/)
  if (tgName && /[A-Za-z]/.test(s)) return "@" + tgName[1]
  const digits = s.replace(/[\s.-]/g, "")
  const local = digits.startsWith("+855") ? "0" + digits.slice(4) : digits.startsWith("855") ? "0" + digits.slice(3) : digits
  return /^0[1-9][0-9]{7,8}$/.test(local) ? local : null
}

/** The question the team receives: trimmed, one paragraph at most 1,000 characters, at least a few letters. */
export function siteQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.replace(/\s+/g, " ").trim().slice(0, 1000)
  return s.length >= 3 ? s : null
}
