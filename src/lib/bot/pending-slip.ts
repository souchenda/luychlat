/**
 * A slip still being read in this chat (founder, 7/11/2026): a note typed meanwhile — «ទិញម្ហូប» right after an ACLEDA
 * slip while «🧾 កំពុងអានស្លីប…» was up — belongs to THAT slip, never to the entry recorded before it (it was written onto
 * the 3,000 ៛ entry of a minute earlier). The note waits here and rides on the slip as its caption once it is read.
 * In memory, like the slip's own retries (a deploy in that window drops both). Pure (pending-slip.test.ts).
 */
type Pending = { until: number; notes: string[] }

const pending = new Map<number, Pending>()

/** The slip's reading started (or goes on, retried): notes typed until `until` wait for it. */
export function slipReading(chatId: number, forMs: number, now = Date.now()) {
  const p = pending.get(chatId)
  pending.set(chatId, { until: Math.max(p?.until ?? 0, now + forMs), notes: p && p.until > now ? p.notes : [] })
}

/** A note typed while a slip is being read: kept for it (true), or there is none (false — the usual follow-up note). */
export function holdForSlip(chatId: number, note: string, now = Date.now()): boolean {
  const p = pending.get(chatId)
  if (!p || p.until <= now) return false
  if (!p.notes.includes(note)) p.notes.push(note)
  return true
}

/** The slip is read (or given up): its caption with the notes typed meanwhile, and the wait ends. */
export function slipRead(chatId: number, caption?: string | null): string | null {
  const notes = pending.get(chatId)?.notes ?? []
  pending.delete(chatId)
  const all = [caption?.trim(), ...notes].filter((s): s is string => Boolean(s))
  return all.length ? all.join(" · ") : (caption ?? null)
}
