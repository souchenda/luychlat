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
