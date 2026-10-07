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
