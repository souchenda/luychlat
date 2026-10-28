// Capacity and spending (founder, 28/10/2026 — «I don't want to spend before it's needed; remind me when it is time to
// act or to spend»). The server agent measures (deploy/ops-agent.py › capacity, every 5 minutes); this file holds the
// limits and the rule for each item. The Control Center shows them all; the founder is told in Telegram once per item
// when it reaches «act» (again after 7 days if still there — lib/server/capacity-reminder.ts). Pure (capacity.test.ts).

/** What the agent reports (OpsReport.capacity). */
export type Capacity = {
  cpus: number
  load15: number
  ram_pct: number | null
  ram_total_mb: number | null
  dockerd_mb: number | null
  building: boolean
  /** Seconds since the last build ended (deploy or APK). */
  build_ago_s?: number
  db_bytes?: number
  db_conns?: number
  db_max_conns?: number
  accounts?: number
  active_30d?: number
  storage_bytes?: number
}

/**
 * The Supabase plan in use. NOT read from Supabase (the database cannot tell): set here. Assumed Free until the founder
 * confirms in Supabase › Settings › Billing; after an upgrade, set "pro" and the limits follow.
 */
export const SUPABASE_PLAN: "free" | "pro" = "free"
const MB = 1024 * 1024
export const PLAN_LIMITS = {
  free: { dbBytes: 500 * MB, storageBytes: 1024 * MB },
  pro: { dbBytes: 8 * 1024 * MB, storageBytes: 100 * 1024 * MB },
} as const

/** Accounts at which to load-test and decide the database plan, before growth decides for us. */
export const ACCOUNTS_MILESTONE = 500
/** The Google Play launch (ROADMAP §6): the plan decision is due from this date. */
export const LAUNCH_DECISION_FROM = "2026-12-01"
export const LAUNCH_DATE = "2027-01-01"
/**
 * The DL Staff organization «CHENDA SOU» went to Supabase Pro on 28/10/2026 to end the egress grace period (a backup loop,
 * fixed the same day). Back to Free once DL Staff stays under 5 GB a month: the founder is reminded from mid-November,
 * before the next invoice, every 7 days until this window ends (founder: «remind me by Telegram mid next month»).
 */
export const DOWNGRADE_REVIEW_FROM = "2026-11-12"
export const DOWNGRADE_REVIEW_UNTIL = "2026-12-15"

/** After a build, the 15-minute load average needs this long to forget it. */
export const BUILD_SETTLE_S = 20 * 60

export type Level = "ok" | "warn" | "act"
export type CapacityKey = "db" | "storage" | "conns" | "accounts" | "ram" | "cpu" | "dockerd" | "launch" | "downgrade"
/** Who acts: the founder (a decision or money) or engineering (free work). Only the founder's items reach Telegram. */
export type Owner = "founder" | "engineering"
export type CapacityItem = { key: CapacityKey; level: Level; pct: number | null; used: string; limit: string; owner: Owner }

const level = (pct: number | null, warn: number, act: number): Level => (pct === null ? "ok" : pct >= act ? "act" : pct >= warn ? "warn" : "ok")
const pctOf = (used: number | null | undefined, limit: number | null | undefined) =>
  used == null || !limit ? null : Math.round((used * 100) / limit)
export const sizeLabel = (bytes: number | null | undefined) =>
  bytes == null ? "?" : bytes >= 1024 * MB ? `${Math.round((bytes / (1024 * MB)) * 10) / 10} GB` : `${Math.round(bytes / MB)} MB`

/** Every item, with how full it is and whether it is time to act. `today` is the Cambodia date (YYYY-MM-DD). */
export function capacityItems(c: Capacity | null | undefined, today: string): CapacityItem[] {
  const lim = PLAN_LIMITS[SUPABASE_PLAN]
  const items: CapacityItem[] = []
  if (c) {
    const db = pctOf(c.db_bytes, lim.dbBytes)
    items.push({ key: "db", level: level(db, 70, 85), pct: db, used: sizeLabel(c.db_bytes), limit: sizeLabel(lim.dbBytes), owner: "founder" })
    const st = pctOf(c.storage_bytes, lim.storageBytes)
    items.push({ key: "storage", level: level(st, 70, 85), pct: st, used: sizeLabel(c.storage_bytes), limit: sizeLabel(lim.storageBytes), owner: "founder" })
    const conns = pctOf(c.db_conns, c.db_max_conns)
    items.push({ key: "conns", level: level(conns, 70, 85), pct: conns, used: String(c.db_conns ?? "?"), limit: String(c.db_max_conns ?? "?"), owner: "founder" })
    const acc = pctOf(c.accounts, ACCOUNTS_MILESTONE)
    items.push({ key: "accounts", level: level(acc, 80, 100), pct: acc, used: String(c.accounts ?? "?"), limit: String(ACCOUNTS_MILESTONE), owner: "founder" })
    // A build's CPU and RAM are not the users': never a reason to spend — during a build, nor while the 15-minute average
    // still carries it (BUILD_SETTLE_S after it ended — 28/10/2026: «CPU 99%» seven minutes after a deploy, the real 9%).
    const build = c.building || (c.build_ago_s !== undefined && c.build_ago_s < BUILD_SETTLE_S)
    const ram = build ? null : c.ram_pct
    items.push({ key: "ram", level: level(ram, 80, 90), pct: ram, used: `${c.ram_pct ?? "?"}%`, limit: `${c.ram_total_mb ? Math.round(c.ram_total_mb / 1024) : "?"} GB`, owner: "founder" })
    const cpu = build ? null : Math.round((c.load15 * 100) / Math.max(1, c.cpus))
    items.push({ key: "cpu", level: level(cpu, 70, 85), pct: cpu, used: String(c.load15), limit: `${c.cpus} CPU`, owner: "founder" })
    // Docker's own memory creeping up is fixed for free (a restart in the quiet hours) — engineering, not money.
    const dk = pctOf(c.dockerd_mb, 1024)
    items.push({ key: "dockerd", level: level(dk, 100, 150), pct: dk, used: `${c.dockerd_mb ?? "?"} MB`, limit: "1024 MB", owner: "engineering" })
  }
  const launch = today >= LAUNCH_DATE ? null : today >= LAUNCH_DECISION_FROM ? "act" : "ok"
  if (launch) items.push({ key: "launch", level: launch, pct: null, used: today, limit: LAUNCH_DATE, owner: "founder" })
  if (today >= DOWNGRADE_REVIEW_FROM && today <= DOWNGRADE_REVIEW_UNTIL)
    items.push({ key: "downgrade", level: "act", pct: null, used: today, limit: DOWNGRADE_REVIEW_UNTIL, owner: "founder" })
  return items
}

/** The founder hears of an item when it reaches «act» — once, and again 7 days later if it is still there. */
export const REMIND_EVERY_MS = 7 * 24 * 3_600_000

export function dueReminders(items: CapacityItem[], sent: Record<string, { level: string; sent_at: string } | undefined>, now: number): CapacityItem[] {
  return items.filter((i) => {
    if (i.level !== "act" || i.owner !== "founder") return false
    const last = sent[i.key]
    if (!last || last.level !== "act") return true
    return now - Date.parse(last.sent_at) >= REMIND_EVERY_MS
  })
}

/** What the founder reads: what is full, what to do, what it costs — one short message per item, plain text. */
export function reminderText(i: CapacityItem): string {
  const head = `📈 ដល់ពេលត្រូវសម្រេច៖ `
  switch (i.key) {
    case "db":
      return `${head}Database ប្រើ ${i.used} ក្នុងចំណោម ${i.limit} (${i.pct}%)។ បងសូមប្តូរ Supabase ទៅ Pro ($25/ខែ) នៅ Supabase › Settings › Billing មុនវាពេញ — បើពេញ អេបអាចឈប់កត់ត្រាបាន។`
    case "storage":
      return `${head}កន្លែងទុករូប (វិក្កយបត្រ កាត) ប្រើ ${i.used} ក្នុងចំណោម ${i.limit} (${i.pct}%)។ បងសូមប្តូរ Supabase ទៅ Pro ($25/ខែ) មុនវាពេញ — បើពេញ គេថតវិក្កយបត្រលែងបាន។`
    case "conns":
      return `${head}ការភ្ជាប់ Database ${i.used}/${i.limit} (${i.pct}%)។ មានអ្នកប្រើច្រើនឡើង៖ ត្រូវការ Supabase Pro ($25/ខែ) និងប្រហែលម៉ាស៊ីន Database ធំជាងមុន។ សូមប្រាប់វិស្វករ ដើម្បីពិនិត្យជាមួយគ្នា។`
    case "accounts":
      return `${head}អ្នកប្រើដល់ ${i.used} គណនីហើយ។ ដល់ពេលតេស្តបន្ទុក (ឥតគិតថ្លៃ) និងសម្រេចប្តូរ Supabase ទៅ Pro ($25/ខែ) មុនវាពេញ។`
    case "ram":
      return `${head}RAM របស់ server ប្រើ ${i.used} នៃ ${i.limit} (មិនមែនពេល build)។ សូមប្រាប់វិស្វករ៖ សម្អាតមុនសិន (ឥតគិតថ្លៃ) បើនៅតែខ្ពស់ ត្រូវដំឡើង server (ប្រហែលទ្វេដងនៃតម្លៃបច្ចុប្បន្ន)។`
    case "cpu":
      return `${head}CPU របស់ server រវល់ ${i.pct}% ជាមធ្យម 15 នាទី (មិនមែនពេល build)។ សូមប្រាប់វិស្វករ៖ ផ្លាស់ការ build ទៅ GitHub (ឥតគិតថ្លៃ) ឬដំឡើង server។`
    case "downgrade":
      return `${head}ពិនិត្យ Supabase › organization «CHENDA SOU» › Usage › Egress របស់ dl-attendance។ បើខែនេះក្រោម 5 GB បងអាចប្តូរ «CHENDA SOU» ពី Pro ត្រឡប់មក Free វិញ (Billing › Change subscription plan › Free) មុនថ្ងៃចេញវិក្កយបត្របន្ទាប់ ដើម្បីកុំបង់ $25 ទៀត។ បើនៅលើស 5 GB សូមរក្សា Pro ហើយប្រាប់វិស្វករ DL Staff។`
    case "launch":
      return `${head}ជិតដល់ថ្ងៃដាក់ Play Store (${LAUNCH_DATE}) ហើយ។ មុនបើកឲ្យសាធារណៈ៖ តេស្តបន្ទុក និងសម្រេចប្តូរ Supabase ទៅ Pro ($25/ខែ)។`
    default:
      return `${head}${i.key} ${i.used}/${i.limit}`
  }
}
