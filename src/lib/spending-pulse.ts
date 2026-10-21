// The home «spending pulse» (founder, 17/10/2026): spending per day (last 7 days, Khmer weekdays), per week
// (last 8 weeks) or per month (last 6 months), in riel at the workspace rate, and the same span before it
// for the comparison. Days are Cambodian days (UTC+7). Pure (spending-pulse.test.ts).

export type PulsePeriod = "day" | "week" | "month"
export type PulsePoint = { key: string; label: string; khr: number }
/** What the pulse sums (founder, 21/10/2026 — Task #446, one tap): the spending, or the income. */
export type PulseKind = "EXPENSE" | "INCOME"

/**
 * Each kind's look and words: the validated chart tokens (globals.css — the warm coral of spending, the emerald of
 * income, each stepped for light and dark), its title and «… 7 ថ្ងៃចុងក្រោយ» line, and whether a rise is good news
 * (more income is; more spending is not) — so the change pill is coloured by meaning, never by direction alone.
 */
export function pulseTheme(kind: PulseKind) {
  return kind === "INCOME"
    ? { color: "var(--viz-income)", fill: "pulse-fill-income", title: "home.pulseIncomeTitle", total: "home.pulseIncomeTotal", tooltip: "tx.INCOME", riseIsGood: true }
    : { color: "var(--viz-expense)", fill: "pulse-fill", title: "home.pulseTitle", total: "home.pulseTotal", tooltip: "tx.EXPENSE", riseIsGood: false }
}
type Tx = { type: string; amount: number; currency: string; transaction_date: string; category_id?: string | null }

const ICT = 7 * 3_600_000
const DAY = 86_400_000
/** Sunday first, as Date.getUTCDay() counts. */
export const KHMER_WEEKDAYS = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"]

/** The Cambodian calendar day of an instant, as a day number (days since 1970-01-01 in UTC+7). */
const ictDay = (ms: number) => Math.floor((ms + ICT) / DAY)
const dayIso = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)

function bucketOf(period: PulsePeriod, day: number): string {
  if (period === "day") return dayIso(day)
  if (period === "week") {
    // Weeks start on Monday.
    const dow = (new Date(day * DAY).getUTCDay() + 6) % 7
    return dayIso(day - dow)
  }
  return dayIso(day).slice(0, 7)
}

/** The buckets shown (oldest first) and the same number before them, for `now`. */
function spans(period: PulsePeriod, now: number): { shown: string[]; before: string[] } {
  const today = ictDay(now)
  const n = period === "day" ? 7 : period === "week" ? 8 : 6
  const keys: string[] = []
  if (period === "month") {
    const d = new Date(today * DAY)
    for (let i = 2 * n - 1; i >= 0; i--) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
      keys.push(m.toISOString().slice(0, 7))
    }
  } else {
    const step = period === "day" ? 1 : 7
    const last = bucketOf(period, today)
    const lastDay = Math.round(Date.parse(`${last}T00:00:00Z`) / DAY)
    for (let i = 2 * n - 1; i >= 0; i--) keys.push(dayIso(lastDay - i * step))
  }
  return { before: keys.slice(0, n), shown: keys.slice(n) }
}

function labelOf(period: PulsePeriod, key: string, locale: string): string {
  if (period === "day") {
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay()
    return locale === "km" ? KHMER_WEEKDAYS[dow] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]
  }
  if (period === "week") {
    const [, m, d] = key.split("-")
    return `${Number(d)}/${Number(m)}`
  }
  const m = Number(key.slice(5, 7))
  return locale === "km"
    ? ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"][m - 1]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]
}

/**
 * Expenses — or, with `kind: "INCOME"`, income (Task #446) — (not transfers, not the excluded categories — balance
 * adjustments) summed per bucket, in riel
 * (USD × the rate): the points shown, their total, and the change from the same span just before
 * (null when that span had nothing — never «+∞%»).
 */
export function spendingPulse(
  transactions: Tx[],
  period: PulsePeriod,
  o: { now?: number; khrPerUsd: number; exclude?: Set<string>; locale?: string; kind?: PulseKind },
): { points: PulsePoint[]; total: number; previous: number; pct: number | null } {
  const now = o.now ?? Date.now()
  const { shown, before } = spans(period, now)
  const sums = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== (o.kind ?? "EXPENSE") || (tx.category_id && o.exclude?.has(tx.category_id))) continue
    const key = bucketOf(period, ictDay(Date.parse(tx.transaction_date)))
    const khr = tx.currency === "KHR" ? tx.amount : tx.amount * o.khrPerUsd
    sums.set(key, (sums.get(key) ?? 0) + khr)
  }
  const points = shown.map((key) => ({ key, label: labelOf(period, key, o.locale ?? "km"), khr: Math.round(sums.get(key) ?? 0) }))
  const total = points.reduce((a, p) => a + p.khr, 0)
  const previous = Math.round(before.reduce((a, k) => a + (sums.get(k) ?? 0), 0))
  const pct = previous > 0 ? Math.round(((total - previous) / previous) * 100) : null
  return { points, total, previous, pct }
}

/** Axis guide labels in riel the Khmer way: «១០ ម៉ឺន», «១,៥ លាន» (en: 100K, 1.5M). */
export function rielTick(v: number, locale: string): string {
  if (v === 0) return "0"
  if (locale !== "km") return v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} លាន`
  if (v >= 10_000) return `${+(v / 10_000).toFixed(1)} ម៉ឺន`
  return v.toLocaleString("en-US")
}
