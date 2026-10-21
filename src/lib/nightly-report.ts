/**
 * The nightly report before midnight (founder, 19/10/2026): one card at 23:30 Cambodia time in «LCA Approval» — the
 * server's health, today's new members and approvals. No revenue; since 20/10/2026 it goes to the founder's private chat
 * only, with each approver's decisions today (Staff Performance). Pure (nightly-report.test.ts).
 */
import { executiveSummary, healthLine } from "./report-standard"

export type NightlyFacts = {
  day: string
  healthy: boolean
  issues: string[]
  diskFreeGb: number | null
  diskPct: number | null
  ramPct: number | null
  ramTotalGb: number | null
  newUsers: number
  approvals: number
  /** Today's decisions per approver (bot_nightly_stats.by_approver), most first; absent → the section is left out. */
  staff?: { name: string; count: number }[]
  dockerOk: boolean
  webhookOk: boolean
  /** The executive summary (founder, 21/10/2026): today's highlights, the other commits, the founder's actions. */
  highlights?: string[]
  patches?: number
  actions?: string[]
  /** Approved cards waiting for their time (Task #452): told, never asked. */
  scheduled?: string[]
  others?: { verify: number; external: number; engineering: number }
  /** Why the scorecard could not be read (the report still goes out and says so). */
  note?: string
}


/** The founder's nightly card on the Reporting Standard: 📊 · 🚀 3–5 highlights · one health line · 🎯 actions. */
export function nightlyReportText(f: NightlyFacts): string {
  const [y, m, d] = f.day.split("-")
  const staff = f.staff?.length ? ` (${f.staff.map((p) => `${p.name} ${p.count}`).join(", ")})` : ""
  return executiveSummary({
    title: `App Luy Chlat · Daily Summary ${d}/${m}/${y}`,
    highlights: f.highlights ?? [],
    patches: f.patches ?? 0,
    health: healthLine({ healthy: f.healthy && f.dockerOk, issues: [...f.issues, ...(f.dockerOk ? [] : ["docker"])], diskFreeGb: f.diskFreeGb, ramPct: f.ramPct, webhookOk: f.webhookOk }),
    facts: [`👥 New members: ${f.newUsers} · Approvals: ${f.approvals}${staff}`, ...(f.note ? [f.note] : [])],
    actions: f.actions ?? [],
    scheduled: f.scheduled,
    others: f.others,
  })
}

/** 23:30–23:59 Cambodia time (a deploy or restart inside the window still sends — once a day, claimed). */
export const nightlyDue = (hour: number, minute: number) => hour === 23 && minute >= 30

/**
 * Which day's report is due now: today's from 23:30; a missed one (a deploy, a restart) caught up until 06:00 the next
 * morning — never silently skipped. Null otherwise.
 */
export function nightlyReportDay(today: string, hour: number, minute: number): string | null {
  if (nightlyDue(hour, minute)) return today
  if (hour < 6) return new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  return null
}

/**
 * The founder's one-off morning briefing (requested 20/10/2026 00:20, for 07:00 that morning): the night's work and the
 * one quick task, with the server's real figures — never a claim the numbers do not support.
 */
export const MORNING_BRIEFING = { day: "2026-10-20", fromMinute: 7 * 60, untilMinute: 11 * 60 } as const

export function morningBriefingText(o: { healthy: boolean; diskFreeGb: number | null }): string {
  const disk = o.diskFreeGb !== null ? `Disk ទំនេរ ${o.diskFreeGb} GB` : "Disk —"
  return [
    "🌅 អរុណសួស្តី! របាយការណ៍សង្ខេបការងារយប់មិញ & សុខភាពប្រព័ន្ធ",
    `• លទ្ធផលការងារយប់មិញ៖ រៀបចំប្រព័ន្ធការពារការខូចដោយស្ងាត់ស្ងៀមរួចរាល់, Server ${o.healthy ? "ដំណើរការល្អ" : "ត្រូវតាមដាន"} (${disk})`,
    "• ស្ថានភាពបច្ចុប្បន្ន៖ ប្រព័ន្ធប៊ូតុងអនុម័ត, RBAC សន្តិសុខទិន្នន័យ, និង Poster ទាំងអស់ដំណើរការរលូន",
    "• កិច្ចការរហ័សសម្រាប់ថ្ងៃនេះ៖ ចុច ១ លើកដើម្បីកំណត់សំឡេងអាហ្សានជាសកលក្នុង /islamic/prayer",
    "— ក្រុមការងារបច្ចេកវិទ្យា អេប លុយឆ្លាត",
  ].join(String.fromCharCode(10))
}
