/**
 * The daily tip's text: which tip from the pool a day starts with, and the next
 * one for "New tip". Shared by the bot (10:30 draft) and Admin › Super › Daily
 * tips. Islamic tips are left out of the public channel.
 */
import { TIPS, tipOfTheDay, type Tip } from "@/lib/tips"

/** What a Telegram photo caption (1024) carries with the preview's header, status and call to action. */
export const TIP_BODY_MAX = 600
export const TIP_TITLE_MAX = 120

const POOL = TIPS.filter((t) => t.topic !== "islamic")

/** The day's starting tip (same rotation as the app's tip of the day). */
export function defaultTip(day: string): Tip {
  const [y, m, d] = day.split("-").map(Number)
  return tipOfTheDay(new Date(y, m - 1, d, 12))
}

/** The tip after `currentId` in the pool (wraps around), for "New tip". */
export function nextTip(currentId: string | null | undefined): Tip {
  const i = POOL.findIndex((t) => t.id === currentId)
  return POOL[(i + 1) % POOL.length]
}

/** A tip already published (or approved) on an earlier day — from the database (bot_tip_used). */
export type UsedTip = { tip_id: string | null; title: string; day: string }

const DIGITS: Record<string, string> = { "០": "0", "១": "1", "២": "2", "៣": "3", "៤": "4", "៥": "5", "៦": "6", "៧": "7", "៨": "8", "៩": "9" }
/** The same title written with Khmer or Latin digits, spaces or a final «។» is the same tip. */
export const titleKey = (title: string) => title.replace(/[០-៩]/g, (d) => DIGITS[d]).replace(/[\s​។.!?]/g, "").toLowerCase()

/**
 * The tip for a day — never one the readers already saw (founder, 8/11/2026: «គន្លឹះត្រូវតែថ្មីជានិច្ច មិនអាចយកគន្លឹះដដែលៗ
 * មកបង្ហាញអ្នកមើលបានទេ» — «ប្រើប័ណ្ណមិនលើស 30%» came back): the pool in its rotation, from the day's tip (or the one after
 * `after`, for «🔄 ប្តូរគន្លឹះថ្មី»), skipping every tip whose id OR title was published before. When every tip has been
 * published, the one shown longest ago, with `repeat` set — the preview then says so (never a silent repeat).
 */
export function freshTip(day: string, used: UsedTip[], after?: string | null): { tip: Tip; repeat: UsedTip | null } {
  const ids = new Set(used.map((u) => u.tip_id).filter(Boolean))
  const titles = new Set(used.map((u) => titleKey(u.title)))
  const start = after ? POOL.findIndex((t) => t.id === after) + 1 : Math.max(0, POOL.findIndex((t) => t.id === defaultTip(day).id))
  for (let i = 0; i < POOL.length; i++) {
    const t = POOL[(start + i) % POOL.length]
    if (t.id !== after && !ids.has(t.id) && !titles.has(titleKey(t.title.km))) return { tip: t, repeat: null }
  }
  // All published: the least recently shown (its LAST showing), never the current one.
  const last = new Map<string, UsedTip>()
  for (const u of used) {
    const t = POOL.find((p) => p.id === u.tip_id || titleKey(p.title.km) === titleKey(u.title))
    if (t && (!last.get(t.id) || last.get(t.id)!.day < u.day)) last.set(t.id, u)
  }
  const oldest = POOL.filter((t) => t.id !== after).sort((a, b) => (last.get(a.id)?.day ?? "").localeCompare(last.get(b.id)?.day ?? ""))[0] ?? POOL[0]
  return { tip: oldest, repeat: last.get(oldest.id) ?? null }
}
