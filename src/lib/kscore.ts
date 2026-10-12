/**
 * CBC (Credit Bureau Cambodia) K-Score — read from a screenshot of the CBC mobile app, confirmed by
 * the person, kept privately for them only (credit_scores, owner-only). The score's range is
 * 100–1400 as CBC shows it; its colour tier follows the CBC bands the founder set (12/10/2026):
 * 100–550 high risk (red), 551–750 moderate (orange), 751–950 good (lime), 951–1400 excellent
 * (emerald). Pure (kscore.test.ts).
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
    "- history: read the trend / history chart point by point — each month label on its axis with the score written at (or above) that point, e.g. Mar 700 … Sep 1044 — oldest first; include the current month. [] only if there is no chart at all. factors: the contributing factors' titles as printed.",
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

/**
 * The change over the history shown — from its first point to the latest score, over the months
 * between — or null when there aren't two real points (never a misleading «+0»).
 */
export function kscoreTrend(read: Pick<KScoreRead, "score" | "history" | "scoreDate">): { from: string; fromScore: number; delta: number; months: number } | null {
  const first = read.history[0]
  if (!first || first.month >= read.scoreDate.slice(0, 7)) return null
  const months = (Number(read.scoreDate.slice(0, 4)) - Number(first.month.slice(0, 4))) * 12 + Number(read.scoreDate.slice(5, 7)) - Number(first.month.slice(5, 7))
  return { from: first.month, fromScore: first.score, delta: read.score - first.score, months }
}

export type KScoreTier = "high" | "moderate" | "good" | "excellent"

/** CBC's bands (founder, 12/10/2026): the tier, its colour and its words. */
export const KSCORE_TIERS: Record<KScoreTier, { min: number; max: number; color: string; to: string; dot: string; km: string; en: string }> = {
  high: { min: 100, max: 550, color: "#EF4444", to: "#DC2626", dot: "🔴", km: "ហានិភ័យខ្ពស់", en: "High risk" },
  moderate: { min: 551, max: 750, color: "#F59E0B", to: "#D97706", dot: "🟠", km: "មធ្យម", en: "Moderate" },
  good: { min: 751, max: 950, color: "#84CC16", to: "#65A30D", dot: "🟢", km: "ល្អ", en: "Good" },
  excellent: { min: 951, max: 1400, color: "#10B981", to: "#059669", dot: "🟢", km: "ល្អប្រសើរ", en: "Excellent" },
}

export function kscoreTier(score: number): KScoreTier {
  return score <= 550 ? "high" : score <= 750 ? "moderate" : score <= 950 ? "good" : "excellent"
}

/** K-Score Guardian: the lenders whose on-time repayments protect the score (open loans' short names). */
export function guardianLenders(debts: { type: string; status: string; party_name: string }[]): string[] {
  const names = debts
    .filter((d) => d.type === "PAYABLE" && d.status !== "SETTLED")
    .map((d) => d.party_name.split(/[·(]/)[0].replace(/កម្ចី.*$/, "").trim())
    .filter(Boolean)
  return [...new Set(names)].slice(0, 3)
}
