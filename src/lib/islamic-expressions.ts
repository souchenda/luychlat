import type { MessageKey } from "@/lib/i18n/dictionaries"

/**
 * Everyday Islamic expressions while Islamic Mode is ON (founder, 18/10/2026); the usual Khmer wording when it is
 * off. One place, so the home greeting and the save messages never mix the two.
 */

/** The home header: «អាស្សាឡាមុអាឡៃកុម, [ឈ្មោះ]» (no waving hand) or «សួស្តី [ឈ្មោះ] ✋». */
export function homeGreeting(islamic: boolean, name: string | null | undefined): { key: MessageKey; params?: { name: string }; wave: boolean } {
  const n = name?.trim()
  if (islamic) return n ? { key: "islamic.greetingName", params: { name: n }, wave: false } : { key: "islamic.greeting", wave: false }
  return n ? { key: "home.greetingName", params: { name: n }, wave: true } : { key: "home.greeting", wave: true }
}

/**
 * The home header as two lines beside the photo (founder, 21/10/2026 — Task #448, so a long name or the Islamic greeting
 * never pushes the dates): the greeting on its own small line and the given name under it, bold, cut with «…» when it is
 * very long. No name yet: the greeting alone. The greeting (Task #449 — no waving hand; as long as the Salam): Islamic
 * Mode «អាស្សាឡាមុអាឡៃកុម» with a moon; otherwise by the time of day in Cambodia — «អរុណសួស្តី» 05:00–11:59,
 * «ទិវាសួស្តី» 12:00–17:59, «សាយណ្ហសួស្តី» 18:00–04:59.
 */
export function greetingStack(islamic: boolean, name: string | null | undefined, hour: number): { greeting: MessageKey; name: string | null; moon: boolean } {
  const n = name?.trim() || null
  if (islamic) return { greeting: "islamic.greeting", name: n, moon: true }
  const greeting: MessageKey = hour >= 5 && hour < 12 ? "home.greetingMorning" : hour >= 12 && hour < 18 ? "home.greetingAfternoon" : "home.greetingEvening"
  return { greeting, name: n, moon: false }
}

/** The hour in Cambodia (UTC+7) — the greeting follows the Cambodian day, wherever the phone's clock is set. */
export const cambodiaHour = (now: number = Date.now()) => new Date(now + 7 * 3_600_000).getUTCHours()

export type SavedKind = "INCOME" | "EXPENSE" | "GOAL"

/**
 * The message after something new is recorded: Alhamdulillah for income, Insha Allah for a new goal, Barakallahu
 * Feek for a payment / expense. An edit (not new) keeps the plain «បានរក្សាទុក».
 */
export function savedMessage(kind: SavedKind | string, islamic: boolean, isNew: boolean): MessageKey {
  if (kind === "GOAL") return islamic && isNew ? "islamic.saved.goal" : "goals.saved"
  if (islamic && isNew && kind === "INCOME") return "islamic.saved.income"
  if (islamic && isNew && kind === "EXPENSE") return "islamic.saved.expense"
  return "entry.saved"
}
