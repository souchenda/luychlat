/**
 * The home header's event pill (components/dashboard/lunar-pill.tsx): the events on the NEAREST date — a national or
 * royal day, a Khmer-Chinese day, a Sil or festival day. The nearest wins (Task #455); when two or more fall on that same
 * date, none is hidden — they take turns every 4 seconds (founder, 22/10/2026 — Task #456). Pure.
 */
export type PillEvent = {
  id: string
  daysAway: number
  text: string
  kind: "national" | "cultural" | "holy"
}

export const PILL_ROTATE_MS = 4000

const ORDER: Record<PillEvent["kind"], number> = { national: 0, cultural: 1, holy: 2 }

/** The events on the nearest date, the national day first, then the Khmer-Chinese day, then the Sil / festival day. */
export function nearestEvents(events: PillEvent[]): PillEvent[] {
  const real = events.filter((e) => Number.isFinite(e.daysAway))
  if (!real.length) return events.slice(0, 1)
  const min = Math.min(...real.map((e) => e.daysAway))
  const seen = new Set<string>()
  return real
    .filter((e) => e.daysAway === min && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

/** The next turn, round and round. */
export const nextTurn = (index: number, count: number) => (count > 0 ? (index + 1) % count : 0)
