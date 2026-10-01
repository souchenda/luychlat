/**
 * Matches statement lines to ledger rows of one wallet. Pure and
 * deterministic; the database re-checks every confirmed match on save.
 *
 * Amount must be exactly equal (signed, wallet currency). Score:
 *   same bank reference                      → 100 (certain)
 *   exact amount                             +20
 *   date 0 / 1 / 2–3 days apart              +40 / +30 / +15
 *   shared words in description vs note      up to +20
 *   the only candidate on both sides          +20
 * ≥70 matched, 40–69 suggested (user confirms), below → unmatched.
 */
import type { StatementLine } from "./parse"

export type LedgerRow = {
  id: string
  /** yyyy-MM-dd in Phnom Penh time. */
  date: string
  /** Signed effect on this wallet, in its currency. */
  amount: number
  /** Note + category name, for word overlap. */
  text: string
  bank_ref: string | null
  reconciled: boolean
}

export type LineMatch =
  | { kind: "matched" | "suggested"; txId: string; score: number }
  | { kind: "unmatched" }

export type MatchResult = {
  /** Keyed by line_no. */
  lines: Map<number, LineMatch>
  /** Ledger rows inside the period with no bank line. */
  appOnly: { id: string; duplicateOf: string | null }[]
}

export const MATCH_AUTO = 70
export const MATCH_SUGGEST = 40
const WINDOW_DAYS = 3

const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w)),
  )
}

const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005

export function matchStatement(lines: StatementLine[], ledger: LedgerRow[], period: { start: string; end: string }): MatchResult {
  const open = ledger.filter((r) => !r.reconciled)
  const lineTokens = new Map(lines.map((l) => [l.line_no, tokens(l.description)]))
  const rowTokens = new Map(open.map((r) => [r.id, tokens(r.text)]))

  // Candidate pairs: exact amount within ±3 days (or an equal bank reference).
  type Pair = { line: StatementLine; row: LedgerRow; days: number; certain: boolean }
  const pairs: Pair[] = []
  for (const line of lines) {
    for (const row of open) {
      if (!sameMoney(line.amount, row.amount)) continue
      const days = Math.abs(dayNumber(line.posted_on) - dayNumber(row.date))
      const certain = Boolean(line.bank_ref && row.bank_ref && line.bank_ref.toLowerCase() === row.bank_ref.toLowerCase())
      if (certain || days <= WINDOW_DAYS) pairs.push({ line, row, days, certain })
    }
  }
  const perLine = new Map<number, number>()
  const perRow = new Map<string, number>()
  for (const p of pairs) {
    perLine.set(p.line.line_no, (perLine.get(p.line.line_no) ?? 0) + 1)
    perRow.set(p.row.id, (perRow.get(p.row.id) ?? 0) + 1)
  }

  const scored = pairs.map((p) => {
    if (p.certain) return { ...p, score: 100 }
    let score = 20 + (p.days === 0 ? 40 : p.days === 1 ? 30 : 15)
    const a = lineTokens.get(p.line.line_no)!
    const b = rowTokens.get(p.row.id)!
    let shared = 0
    for (const w of a) if (b.has(w)) shared++
    score += Math.min(20, shared * 10)
    if (perLine.get(p.line.line_no) === 1 && perRow.get(p.row.id) === 1) score += 20
    return { ...p, score: Math.min(100, score) }
  })
  // Best first; ties: closer date, then earlier line.
  scored.sort((x, y) => y.score - x.score || x.days - y.days || x.line.line_no - y.line.line_no)

  const result = new Map<number, LineMatch>()
  const usedRows = new Set<string>()
  for (const p of scored) {
    if (result.has(p.line.line_no) || usedRows.has(p.row.id) || p.score < MATCH_SUGGEST) continue
    result.set(p.line.line_no, { kind: p.score >= MATCH_AUTO ? "matched" : "suggested", txId: p.row.id, score: p.score })
    usedRows.add(p.row.id)
  }
  for (const line of lines) if (!result.has(line.line_no)) result.set(line.line_no, { kind: "unmatched" })

  // App rows in the period that the bank doesn't show. When a matched row has
  // the same amount within a day, this one is probably a double entry.
  const matchedRows = open.filter((r) => usedRows.has(r.id))
  const appOnly = open
    .filter((r) => !usedRows.has(r.id) && r.date >= period.start && r.date <= period.end)
    .map((r) => ({
      id: r.id,
      duplicateOf:
        matchedRows.find((m) => sameMoney(m.amount, r.amount) && Math.abs(dayNumber(m.date) - dayNumber(r.date)) <= 1)?.id ?? null,
    }))

  return { lines: result, appOnly }
}
