/**
 * The Ministry of Commerce's retail fuel price notices, as posted on its
 * Telegram channel (t.me/mocnewsfeed): a short text with the period and one
 * image of the stamped notice with the prices. Pure — the fetching and the
 * image reading are in src/lib/server/moc-fuel-sync.ts.
 *
 *   សេចក្តីជូនដំណឹង៖ ស្តីពីថ្លៃលក់រាយប្រេងឥន្ធនៈនៅតាមស្ថានីយសម្រាប់ការអនុវត្ត
 *   ចាប់ពីវេលាម៉ោង ១ រសៀលថ្ងៃទី២១ ខែកញ្ញា រហូតដល់ថ្ងៃទី១ ខែតុលា ឆ្នាំ២០២៦
 */

const KM_DIGITS = "០១២៣៤៥៦៧៨៩"
const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]

/** "២០២៦" → "2026". */
export const latinDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KM_DIGITS.indexOf(d)))

const pad = (n: number) => String(n).padStart(2, "0")
const monthOf = (name: string | undefined) => (name ? KM_MONTHS.findIndex((m) => name.startsWith(m)) + 1 : 0)

/** Is this post the retail fuel price notice? */
export const isFuelNotice = (text: string) => /ថ្លៃលក់រាយប្រេងឥន្ធនៈ/.test(text)

/**
 * The period in a notice's text: "ថ្ងៃទី២១ ខែកញ្ញា រហូតដល់ថ្ងៃទី១ ខែតុលា ឆ្នាំ២០២៦" →
 * 2026-09-21 … 2026-10-01 (the start month is often left out: "ថ្ងៃទី១ រហូតដល់ថ្ងៃទី១១ ខែតុលា").
 */
export function parseNoticePeriod(raw: string): { from: string; to: string } | null {
  const text = latinDigits(raw).replace(/\s+/g, " ")
  const m = /ថ្ងៃទី\s*(\d{1,2})(?:\s*ខែ\s*([^\s\d]+))?(?:\s*ឆ្នាំ\s*(\d{4}))?\s*រហូតដល់\s*ថ្ងៃទី\s*(\d{1,2})\s*ខែ\s*([^\s\d]+)\s*ឆ្នាំ\s*(\d{4})/.exec(text)
  if (!m) return null
  const [fd, td, ty] = [Number(m[1]), Number(m[4]), Number(m[6])]
  const tm = monthOf(m[5])
  if (!tm) return null
  let fm = monthOf(m[2]) || tm
  // "ថ្ងៃទី២១ … រហូតដល់ថ្ងៃទី១ ខែតុលា" with no start month: the start is in the month before.
  if (!m[2] && fd > td) fm = tm === 1 ? 12 : tm - 1
  const fy = m[3] ? Number(m[3]) : fm > tm ? ty - 1 : ty
  const valid = (y: number, mo: number, d: number) => d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
  if (!valid(fy, fm, fd) || !valid(ty, tm, td)) return null
  const from = `${fy}-${pad(fm)}-${pad(fd)}`
  const to = `${ty}-${pad(tm)}-${pad(td)}`
  return from <= to ? { from, to } : null
}

export type ChannelPost = { id: number; text: string; image: string | null; date: string | null }

const unescape = (s: string) =>
  s
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")

/** The posts on a public channel's web preview (https://t.me/s/<channel>), oldest first. */
export function channelPosts(html: string, channel: string): ChannelPost[] {
  const marker = `data-post="${channel}/`
  const parts = html.split(marker).slice(1)
  return parts
    .map((part) => {
      const id = Number(/^(\d+)"/.exec(part)?.[1])
      const text = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/.exec(part)?.[1]
      const image = /tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/.exec(part)?.[1] ?? null
      const date = /<time[^>]*datetime="([^"]+)"/.exec(part)?.[1] ?? null
      return { id, text: text ? unescape(text).trim() : "", image: image && /^https:\/\//.test(image) ? image : null, date }
    })
    .filter((p) => Number.isFinite(p.id) && p.id > 0)
}

export type NoticePrices = {
  regular: number
  diesel: number
  /** The same prices in dollars (the notice's row above): an independent check of the riel figures. */
  regularUsd: number | null
  dieselUsd: number | null
  from: string | null
  to: string | null
}

/** A price as printed: riel per litre, a whole 50, within reason. */
const price = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(latinDigits(String(v ?? "")).replace(/[^\d]/g, ""))
  return Number.isInteger(n) && n >= 2000 && n <= 20000 && n % 50 === 0 ? n : null
}
const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/** What the image reader returned, checked. Null unless both prices are plausible. */
export function cleanNoticePrices(raw: unknown): NoticePrices | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.is_fuel_notice === false) return null
  const regular = price(r.regular)
  const diesel = price(r.diesel)
  if (!regular || !diesel) return null
  const usd = (v: unknown) => (typeof v === "number" && v > 0.3 && v < 6 ? v : null)
  return { regular, diesel, regularUsd: usd(r.regular_usd), dieselUsd: usd(r.diesel_usd), from: isoDay(r.from), to: isoDay(r.to) }
}

/**
 * Do the riel prices agree with the dollar ones at the NBC rate? The notice prints both
 * (row 8 "$1.27", row 9 "៥ ១៥០ រៀល"); a misread digit in either breaks the agreement.
 */
export function pricesAgree(p: NoticePrices, usdKhr: number | null | undefined): boolean {
  if (!usdKhr || !p.regularUsd || !p.dieselUsd) return false
  const near = (khr: number, usd: number) => Math.abs(khr - usd * usdKhr) <= 100
  return near(p.regular, p.regularUsd) && near(p.diesel, p.dieselUsd)
}
