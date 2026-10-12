/**
 * CBC (Credit Bureau Cambodia) K-Score — read from a screenshot of the CBC mobile app, confirmed by
 * the person, kept privately for them only (credit_scores, owner-only). The score's range is
 * 100–1400 as CBC shows it; the risk label is CBC's own words from the screen — never derived here
 * (no silent guessing). Pure (kscore.test.ts).
 */

export const KSCORE_MIN = 100
export const KSCORE_MAX = 1400

export type KScoreRead = {
  score: number
  /** CBC's wording, e.g. "Excellent", "Low Risk" — null when the screen shows none. */
  riskLabel: string | null
  scoreDate: string
  /** Month (YYYY-MM) → score, oldest first. */
  history: { month: string; score: number }[]
  /** "Key Contributing Factors" as printed (at most 5). */
  factors: string[]
}

export function kscorePrompt(today: string): string {
  return [
    `Today is ${today}. This photo should be a screen of the CBC (Credit Bureau Cambodia) mobile app showing a K-Score: headers like "K Score" or "My K-Score", a gauge from 100 to 1400, the score date, a history chart by month, and "Key Contributing Factors".`,
    "Answer only JSON:",
    '{"is_kscore": boolean, "score": number | null, "risk_label": string | null, "score_date": "YYYY-MM-DD" | null, "history": [{"month": "YYYY-MM", "score": number}], "factors": [string]}',
    "- score: the current K-Score shown big on the gauge. risk_label: the words the screen uses for the level (e.g. Excellent, Low Risk) — null if none.",
    "- history: every month point you can read on the trend chart, oldest first; [] if there is no chart. factors: the contributing factors' titles as printed.",
    "- Never invent a value. Ignore names, ID numbers and phone numbers.",
    'If it is not a CBC K-Score screen, answer {"is_kscore": false}.',
  ].join("\n")
}

const inRange = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= KSCORE_MIN && n <= KSCORE_MAX
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)

/** The model's JSON → a K-Score reading, or null when it isn't one / the score is implausible. */
export function cleanKScore(raw: unknown, today: string): KScoreRead | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.is_kscore !== true) return null
  const score = typeof r.score === "string" ? Number(r.score) : r.score
  const scoreDate = isoDate(r.score_date)
  if (!inRange(score) || !scoreDate || scoreDate > today) return null
  const history = Array.isArray(r.history)
    ? (r.history as { month?: unknown; score?: unknown }[])
        .filter((h) => typeof h?.month === "string" && /^\d{4}-\d{2}$/.test(h.month) && inRange(h.score))
        .map((h) => ({ month: h.month as string, score: h.score as number }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .filter((h, i, all) => i === 0 || h.month !== all[i - 1].month)
        .slice(-24)
    : []
  const label = typeof r.risk_label === "string" && r.risk_label.trim() ? r.risk_label.trim().slice(0, 40) : null
  const factors = Array.isArray(r.factors) ? (r.factors as unknown[]).filter((f): f is string => typeof f === "string" && Boolean(f.trim())).map((f) => f.trim().slice(0, 80)).slice(0, 5) : []
  return { score: score as number, riskLabel: label, scoreDate, history, factors }
}

/** Where the score sits on the 100–1400 gauge (0–1). */
export const gaugeFraction = (score: number) => Math.min(1, Math.max(0, (score - KSCORE_MIN) / (KSCORE_MAX - KSCORE_MIN)))

/** The change over the history shown (first point → the latest score), or null without history. */
export function kscoreTrend(read: Pick<KScoreRead, "score" | "history">): { from: string; delta: number } | null {
  const first = read.history[0]
  if (!first) return null
  return { from: first.month, delta: read.score - first.score }
}

/** The colour only from CBC's own words: green for a good / low-risk label, amber for a warning one, else neutral. */
export function riskTone(label: string | null): "good" | "warn" | "neutral" {
  if (!label) return "neutral"
  if (/excellent|very good|good|low risk|ល្អ/i.test(label)) return "good"
  if (/fair|average|medium|moderate|poor|high risk|very high|មធ្យម|ខ្សោយ/i.test(label)) return "warn"
  return "neutral"
}

/** K-Score Guardian: the lenders whose on-time repayments protect the score (open loans' short names). */
export function guardianLenders(debts: { type: string; status: string; party_name: string }[]): string[] {
  const names = debts
    .filter((d) => d.type === "PAYABLE" && d.status !== "SETTLED")
    .map((d) => d.party_name.split(/[·(]/)[0].replace(/កម្ចី.*$/, "").trim())
    .filter(Boolean)
  return [...new Set(names)].slice(0, 3)
}
