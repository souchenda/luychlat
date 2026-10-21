/**
 * The fuel price announcement's words (the community channel and the Facebook Page): the Ministry's prices for the cycle,
 * each with its change against the cycle before, and the source — then the standard compact footer with «#តម្លៃប្រេង»
 * (founder, 21/10/2026 — the old «✨ ចុះឈ្មោះប្រើ… 👇👇» line is gone). Pure (fuel-poster.test.ts, moc-fuel-post.test.ts).
 */
import type { FuelPrices } from "@/lib/market-calc"
import { postFooter, withFooter, type FooterPlatform } from "@/lib/post-footer"

export const MOC_CHANNEL = "mocnewsfeed"
/** The fuel post's own hashtag, after the brand's. */
export const FUEL_HASHTAG = "#តម្លៃប្រេង"

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const riel = (n: number) => kmDigits(new Intl.NumberFormat("en-US").format(n))
const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]

/** ▲ / ▼ against the previous period's price (none when unchanged or unknown). */
function change(now: number, before: number | null | undefined) {
  if (!before || before === now) return ""
  return ` (${now > before ? "▲" : "▼"} ${riel(Math.abs(now - before))})`
}

/** «សម្រាប់ថ្ងៃទី ១១ ដល់ ២១ ខែតុលា ឆ្នាំ ២០២៦» — the period exactly as the notice states it. */
export function periodLine(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const day = (n: number) => kmDigits(String(n).padStart(2, "0"))
  const start = fm === tm && fy === ty ? `${day(fd)}` : `${day(fd)} ខែ${KM_MONTHS[fm - 1]}${fy === ty ? "" : ` ឆ្នាំ ${kmDigits(String(fy))}`}`
  return `សម្រាប់ថ្ងៃទី ${start} ដល់ ${day(td)} ខែ${KM_MONTHS[tm - 1]} ឆ្នាំ ${kmDigits(String(ty))}`
}

/** The community channel post for a new notice (plain text; the footer is added by fuelCaption). */
export function newPricesText(fuel: Pick<FuelPrices, "regular" | "diesel" | "from" | "to"> & { super?: number | null }, previous: Pick<FuelPrices, "regular" | "diesel"> & { super?: number | null } | null, postId: number): string {
  return [
    "⛽ តម្លៃលក់រាយប្រេងឥន្ធនៈផ្លូវការ (ក្រសួងពាណិជ្ជកម្ម)",
    `📅 ${periodLine(fuel.from, fuel.to)} (អនុវត្តចាប់ពីម៉ោង ១ រសៀល)`,
    "",
    `• សាំងធម្មតា (EA92) ៖ ${riel(fuel.regular)} ៛/លីត្រ${change(fuel.regular, previous?.regular)}`,
    // EA95 only when the notice lists it — never a placeholder.
    ...(fuel.super ? [`• សាំងស៊ុបពែរ (EA95) ៖ ${riel(fuel.super)} ៛/លីត្រ${change(fuel.super, previous?.super)}`] : []),
    `• ប្រេងម៉ាស៊ូត (Diesel) ៖ ${riel(fuel.diesel)} ៛/លីត្រ${change(fuel.diesel, previous?.diesel)}`,
    "",
    `ℹ️ ប្រភព៖ សេចក្តីជូនដំណឹងក្រសួងពាណិជ្ជកម្ម · t.me/${MOC_CHANNEL}/${postId}`,
  ].join("\n")
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The post with the standard compact footer and «#តម្លៃប្រេង»: Telegram's is HTML (the post's own words escaped), a
 * photo caption at most 1,024 characters (the footer goes rather than the post being cut); Facebook's is plain text.
 */
export function fuelCaption(text: string, platform: FooterPlatform, photo = true): string {
  const footer = postFooter("community", platform, [FUEL_HASHTAG])
  return platform === "telegram" ? withFooter(esc(text), footer, photo ? 1024 : 4096) : withFooter(text, footer, 60_000)
}
