/**
 * SoundBox: a customer's KHQR payment announced on the cashier screen (/soundbox) — the spoken text,
 * the amount as shown, and which payments are announced at all. Pure (soundbox.test.ts); the
 * audio is src/lib/soundbox-audio.ts, the live events public.soundbox_events.
 */

export type SoundboxLang = "km" | "en"
export type SoundboxEvent = {
  id: string
  amount: number
  currency: "KHR" | "USD"
  account_name: string
  payer: string | null
  transaction_time: string
}

/**
 * Which /api/khqr/ingest results are announced: a recorded customer payment only ("ok") — never an
 * own-account transfer ("transfer"), a duplicate, or anything refused. (The database checks again:
 * INCOME, a bank reference, the Sales category.)
 */
export const shouldEmit = (status: string | undefined) => status === "ok"

const DIGITS = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"]
const TENS = ["", "ដប់", "ម្ភៃ", "សាមសិប", "សែសិប", "ហាសិប", "ហុកសិប", "ចិតសិប", "ប៉ែតសិប", "កៅសិប"]
// Spoken Khmer counts in ten-thousands (ម៉ឺន) and hundred-thousands (សែន): 50,000 is ប្រាំម៉ឺន.
const UNITS: [number, string][] = [
  [100_000, "សែន"],
  [10_000, "ម៉ឺន"],
  [1_000, "ពាន់"],
  [100, "រយ"],
]

/** A whole number in Khmer words: 20,000 → ពីរម៉ឺន, 125,000 → មួយសែនពីរម៉ឺនប្រាំពាន់, 1,500,000 → មួយលានប្រាំសែន. */
export function khmerNumber(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return DIGITS[0]
  if (n >= 1_000_000) {
    const rest = n % 1_000_000
    return `${khmerNumber(Math.floor(n / 1_000_000))}លាន${rest ? khmerNumber(rest) : ""}`
  }
  for (const [size, word] of UNITS) {
    if (n >= size) {
      const rest = n % size
      return `${DIGITS[Math.floor(n / size)]}${word}${rest ? khmerNumber(rest) : ""}`
    }
  }
  if (n >= 10) return `${TENS[Math.floor(n / 10)]}${n % 10 ? DIGITS[n % 10] : ""}`
  return DIGITS[n]
}

const cents = (amount: number) => Math.round((amount - Math.floor(amount)) * 100)

/** The amount as spoken: «ប្រាំម៉ឺនរៀល», «ប្រាំដុល្លារ ហាសិបសេន» / «50,000 riel», «5 dollars and 50 cents». */
export function spokenAmount(amount: number, currency: "KHR" | "USD", lang: SoundboxLang): string {
  if (currency === "KHR") {
    const riel = Math.round(amount)
    return lang === "km" ? `${khmerNumber(riel)}រៀល` : `${riel.toLocaleString("en-US")} riel`
  }
  const dollars = Math.floor(amount)
  const c = cents(amount)
  if (lang === "km") return [dollars ? `${khmerNumber(dollars)}ដុល្លារ` : null, c ? `${khmerNumber(c)}សេន` : null].filter(Boolean).join(" ") || "សូន្យដុល្លារ"
  const d = dollars ? `${dollars.toLocaleString("en-US")} dollar${dollars === 1 ? "" : "s"}` : null
  const s = c ? `${c} cent${c === 1 ? "" : "s"}` : null
  return [d, s].filter(Boolean).join(" and ") || "0 dollars"
}

/** What the SoundBox says: «ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល» / «Received 50,000 riel». */
export const announcementText = (e: Pick<SoundboxEvent, "amount" | "currency">, lang: SoundboxLang) =>
  lang === "km" ? `ទទួលបានប្រាក់ ${spokenAmount(e.amount, e.currency, "km")}` : `Received ${spokenAmount(e.amount, e.currency, "en")}`

/** The amount on screen: «+50,000 ៛», «+$12.50». */
export const shownAmount = (amount: number, currency: "KHR" | "USD") =>
  currency === "KHR" ? `+${Math.round(amount).toLocaleString("en-US")} ៛` : `+$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export type AudioStep = "chime" | "speech" | "melody"

/**
 * What plays for a payment: nothing while the sound is off or not yet unlocked by a tap (browsers
 * block audio until then); otherwise the payment chime, then the spoken amount when the device
 * has a voice for the language — else a short melody instead of silence.
 */
export function audioPlan(o: { soundOn: boolean; unlocked: boolean; voice: boolean }): AudioStep[] {
  if (!o.soundOn || !o.unlocked) return []
  return ["chime", o.voice ? "speech" : "melody"]
}

/** Today's receipts (Cambodia day), per currency. */
export function todayTotals(events: Pick<SoundboxEvent, "amount" | "currency" | "transaction_time">[], today: string) {
  const day = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10)
  const mine = events.filter((e) => day(e.transaction_time) === today)
  const sum = (c: "KHR" | "USD") => mine.filter((e) => e.currency === c).reduce((a, e) => a + Number(e.amount), 0)
  return { count: mine.length, khr: Math.round(sum("KHR")), usd: Math.round(sum("USD") * 100) / 100 }
}
