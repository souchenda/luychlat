/**
 * The nightly report before midnight (founder, 19/10/2026): one card at 23:30 Cambodia time in «LCA Approval» — the
 * server's health, today's new members and approvals. Counts only (no revenue, no names). Pure (nightly-report.test.ts).
 */
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
  dockerOk: boolean
  webhookOk: boolean
}

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

export function nightlyReportText(f: NightlyFacts): string {
  const [y, m, d] = f.day.split("-")
  const disk = f.diskFreeGb !== null && f.diskPct !== null ? `${f.diskFreeGb} GB ទំនេរ (${f.diskPct}% ប្រើប្រាស់)` : "—"
  const ram = f.ramPct !== null ? `${f.ramPct}%${f.ramTotalGb ? ` នៃ ${f.ramTotalGb} GB` : ""}` : "—"
  return [
    "📊 របាយការណ៍ប្រចាំថ្ងៃ & សុខភាព Server (មុនម៉ោង ១២ យប់)",
    `• កាលបរិច្ឆេទ៖ ${kmDigits(`${d}/${m}/${y}`)}`,
    `• ស្ថានភាព Server៖ ${f.healthy ? "🟢 សកម្មធម្មតា (Healthy)" : `🟠 ត្រូវតាមដាន (${f.issues.join(", ")})`}`,
    `• ទំហំថាសរឹង (Disk)៖ ${disk}`,
    `• ការចងចាំ (RAM)៖ ${ram}`,
    `• សមាជិកថ្មីថ្ងៃនេះ៖ ${f.newUsers}`,
    `• ការអនុម័តថ្ងៃនេះ៖ ${f.approvals}`,
    `• ស្ថានភាព Docker & Webhook៖ ${f.dockerOk && f.webhookOk ? "ដំណើរការល្អ" : `${f.dockerOk ? "Docker ល្អ" : "Docker មានបញ្ហា"} · ${f.webhookOk ? "Webhook ល្អ" : "Webhook មានបញ្ហា"}`}`,
    "— ប្រព័ន្ធស្វ័យប្រវត្តិ អេប លុយឆ្លាត",
  ].join("\n")
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
