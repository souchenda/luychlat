// The incident kit (founder, 28/10/2026 — «I don't want to answer customers while the app has a problem»): the few
// notices the app can show everyone, each written and approved in advance (i18n «notice.<kind>.title / .body», km / en /
// zh) — never free text typed in a hurry. One at a time (public.app_notice): set by the health watchdog when the database
// or the bot has been down 5 minutes, cleared when it recovers; or by the founder's tap in the Control Center.

export const NOTICE_KINDS = ["app_slow", "bot_slow", "bank_alerts_slow", "maintenance"] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]

/** The watchdog's issues that customers feel, and what they read meanwhile (lib/server/health-watchdog.ts › PAGE_ISSUES). */
export const AUTO_NOTICE: Record<"db_down" | "webhook", NoticeKind> = { db_down: "app_slow", webhook: "bot_slow" }

/** Planned maintenance is announced this long before it starts. */
export const MAINTENANCE_LEAD_MS = 24 * 3_600_000

export type NoticeRow = { kind: string | null; starts_at: string | null; ends_at: string | null } | null | undefined

/** What to show now: the notice, or nothing — an unknown kind, an ended maintenance or one more than a day away show nothing. */
export function visibleNotice(row: NoticeRow, now: number): NoticeKind | null {
  if (!row?.kind || !(NOTICE_KINDS as readonly string[]).includes(row.kind)) return null
  const kind = row.kind as NoticeKind
  if (kind !== "maintenance") return kind
  const start = row.starts_at ? Date.parse(row.starts_at) : NaN
  const end = row.ends_at ? Date.parse(row.ends_at) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return now >= start - MAINTENANCE_LEAD_MS && now < end ? kind : null
}
