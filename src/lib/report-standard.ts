/**
 * The Reporting Standard — an executive summary (founder, 21/10/2026, replacing the full lists of 20/10: «overwhelming,
 * cluttered, and unreadable for a mobile screen»). Every automated status report to the founder (the 23:30 nightly
 * report and /report, the 23:59 end-of-day report) is built here, never ad hoc. Pure (report-standard.test.ts);
 * documented in CLAUDE.md › Reporting Standards.
 *
 *   📊 the title and the date
 *   🚀 3–5 curated highlights (ROADMAP.md items finished today; feature commits only when fewer than three), then one
 *      line «(+ X technical patches & fixes under the hood)» — X counted exactly, never a raw commit list
 *   🟢 one health line: «System Health: 100% Healthy (Disk: 53GB free, RAM: 47%, Webhook: OK)» — no CPU-peak log lines
 *   🎯 Action Required: short, numbered, only what needs the founder's decision or approval; everything else one count line
 *
 * Plain text, only the icons above (no flags), a blank line between blocks. Never «… +N more»: a list that is shown is
 * shown whole; what is not a highlight is counted in one sentence.
 */

export type Owner = "verify" | "founder" | "external" | "engineering"

/**
 * The owner tag that starts a reason (ROADMAP.md «⛔ 🟡 ចុច ✅ លើកាត #833»): 🟢 live, the founder tests · 🟡 the founder
 * acts or approves · ⏳ someone outside · ⚙️ engineering. Explicit, never guessed from the words.
 */
const TAGS: [string, Owner][] = [
  ["🟢", "verify"],
  ["🟡", "founder"],
  ["⏳", "external"],
  ["⚙️", "engineering"],
  ["⚙", "engineering"],
]

export function ownerTag(reason: string): { owner: Owner; action: string } | null {
  const t = reason.trim()
  for (const [tag, owner] of TAGS) if (t.startsWith(tag)) return { owner, action: t.slice(tag.length).replace(/^[\s:៖—-]+/, "").trim() }
  return null
}

/** A finished ROADMAP.md item (with the commits it names) or a commit, as a highlight candidate. */
export type Shipped = { title: string; hashes: string[] }

const cites = (hashes: string[], full: string) => hashes.some((h) => full.startsWith(h) || h.startsWith(full))

/**
 * The 3–5 highlights and the exact number of today's other commits: ROADMAP.md items finished today first (curated by
 * hand), topped up from feature commits when fewer than three. X = today's commits that no shown highlight names.
 */
export function curate(done: Shipped[], features: { hash: string; subject: string }[], commits: string[], max = 5): { highlights: string[]; patches: number } {
  const k = Math.min(Math.max(max, 3), 5)
  // The major ones first: an item that shipped a feature, then the most recent work (a later commit of the day).
  const feature = (s: Shipped) => features.some((f) => cites(s.hashes, f.hash))
  const latest = (s: Shipped) => Math.max(-1, ...commits.map((c, i) => (cites(s.hashes, c) ? i : -1)))
  const ranked = done.map((s, i) => ({ s, i })).sort((a, b) => Number(feature(b.s)) - Number(feature(a.s)) || latest(b.s) - latest(a.s) || a.i - b.i)
  const shown: Shipped[] = ranked.slice(0, k).map((r) => r.s)
  for (const f of features) {
    if (shown.length >= 3) break
    if (!shown.some((s) => cites(s.hashes, f.hash))) shown.push({ title: f.subject, hashes: [f.hash] })
  }
  const patches = commits.filter((c) => !shown.some((s) => cites(s.hashes, c))).length
  return { highlights: shown.map((s) => headline(s.title)), patches }
}

/**
 * A highlight's headline: the title up to its first « — », «; », «: » or « (» — how ROADMAP.md titles are written (the
 * headline, then the detail). Never cut mid-word, never an ellipsis; a title without such a break stays whole.
 */
export function headline(title: string): string {
  const t = title.replace(/\s+/g, " ").trim()
  const cut = t.search(/ — |; |: | \(/)
  return cut > 0 ? t.slice(0, cut) : t
}

export type Health = {
  /** The share of today's health samples that were healthy, when known (the end-of-day report). */
  okPct?: number | null
  healthy: boolean
  issues?: string[]
  diskFreeGb: number | null
  ramPct: number | null
  webhookOk: boolean
}

const round = (n: number) => String(Math.round(n))

/** «🟢 System Health: 100% Healthy (Disk: 53GB free, RAM: 47%, Webhook: OK)» — or 🟠 with what needs a look. */
export function healthLine(h: Health): string {
  const good = h.healthy && h.webhookOk && (h.okPct == null || h.okPct >= 99)
  const state = h.okPct != null ? `${round(h.okPct)}% Healthy` : h.healthy ? "Healthy" : "Needs attention"
  const issues = !h.healthy && h.issues?.length ? ` — ${h.issues.join(", ")}` : ""
  const disk = h.diskFreeGb != null ? `${round(h.diskFreeGb)}GB free` : "—"
  const ram = h.ramPct != null ? `${round(h.ramPct)}%` : "—"
  return `${good ? "🟢" : "🟠"} System Health: ${state}${issues} (Disk: ${disk}, RAM: ${ram}, Webhook: ${h.webhookOk ? "OK" : "ERROR"})`
}

export type Summary = {
  /** «App Luy Chlat · Daily Summary 20/10/2026» — the 📊 is added. */
  title: string
  highlights: string[]
  patches: number
  health: string
  /** Extra one-liners under the health line (new members, approvals). */
  facts?: string[]
  /** The founder's actions only (🟡), as short imperatives — never a card already decided (checkActions). */
  actions: string[]
  /** Approved and waiting for their time (Task #452): told, never asked again. */
  scheduled?: string[]
  /** How many other open items wait on a test, someone outside, or engineering — one line, no list. */
  others?: { verify: number; external: number; engineering: number }
  footer?: string
}

/** A card in «LCA Approval» still waiting (bot_posts_waiting), by its message number — the «កាត #833» a roadmap step names. */
export type WaitingCard = { msg: number; status: "PENDING" | "APPROVED"; publishAt: string }

export const SCHEDULED_TITLE = "⏳ កាលវិភាគរង់ចាំផ្សាយស្វ័យប្រវត្តិ (បានអនុម័តរួចរាល់)"

/** «ចុច ✅ លើកាត #833 ក្នុង «LCA Approval»» → [833]. */
export const cardNumbers = (action: string) => [...action.matchAll(/កាត\s*#(\d+)/g)].map((m) => Number(m[1]))

const when = (iso: string) => {
  const t = new Date(Date.parse(iso) + 7 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

/**
 * The founder's roadmap steps, checked against the approval cards (founder, 22/10/2026 — Task #452: the report asked to
 * «ចុច ✅ លើកាត #860» on a du'a published the day before, and #833 approved on 20/10 for 29/10). A step naming a card:
 * still PENDING → asked; APPROVED and waiting for its time → the ⏳ scheduled list, told once, never asked; no longer
 * waiting (published, paused, expired) → nothing to do, left out. A step with no card is asked as written. The cards
 * unreadable (`null`) → every step is asked — nothing is ever hidden by a failed lookup.
 */
export function checkActions(founder: { title: string; action: string }[], cards: WaitingCard[] | null): { actions: string[]; scheduled: string[] } {
  if (!cards) return { actions: founder.map((f) => f.action), scheduled: [] }
  const byMsg = new Map(cards.map((c) => [c.msg, c]))
  const actions: string[] = []
  const scheduled: string[] = []
  for (const f of founder) {
    const refs = cardNumbers(f.action)
    if (!refs.length) {
      actions.push(f.action)
      continue
    }
    const waiting = refs.map((n) => byMsg.get(n)).filter((c): c is WaitingCard => Boolean(c))
    if (waiting.some((c) => c.status === "PENDING")) actions.push(f.action)
    else if (waiting.length) {
      const title = f.title.length > 70 ? `${f.title.slice(0, 69)}…` : f.title
      scheduled.push(`${title} — កាត #${waiting[0].msg} · ផ្សាយ ${when(waiting[0].publishAt)}`)
    }
  }
  return { actions, scheduled }
}

/** The executive summary as plain text, airy for a phone: blocks separated by a blank line. */
export function executiveSummary(s: Summary): string {
  const blocks: string[][] = [[`📊 ${s.title}`]]
  const shipped = s.highlights.length
    ? ["🚀 Shipped today", ...s.highlights.map((h) => `✅ ${h}`)]
    : ["🚀 Shipped today", "✅ Nothing new deployed today"]
  if (s.patches > 0) shipped.push(`(+ ${s.patches} technical patch${s.patches === 1 ? "" : "es"} & fixes under the hood)`)
  blocks.push(shipped)
  blocks.push([s.health, ...(s.facts ?? [])])
  const actions = [...new Set(s.actions.map((a) => a.trim()).filter(Boolean))]
  blocks.push(actions.length ? [`🎯 Action Required (${actions.length})`, ...actions.map((a, i) => `${i + 1}. ${a}`)] : ["🎯 Action Required: nothing — all clear"])
  if (s.scheduled?.length) blocks.push([SCHEDULED_TITLE, ...s.scheduled.map((x) => `• ${x}`)])
  const o = s.others
  if (o && o.verify + o.external + o.engineering > 0)
    blocks.push([`Also open: ${o.verify} ready to test · ${o.external} with outside reviewers · ${o.engineering} with engineering`])
  if (s.footer) blocks.push([s.footer])
  return blocks.map((b) => b.join("\n")).join("\n\n")
}

/** Telegram allows 4,096 characters; the room left for the «(១/២)» label and the number mask. */
export const TELEGRAM_PAGE = 3900

const KM = "០១២៣៤៥៦៧៨៩"
const km = (n: number) => String(n).replace(/\d/g, (d) => KM[Number(d)])

/** A safety net, never a design: a report over Telegram's limit goes as numbered parts «(១/២)», every line kept. */
export function paginate(text: string, limit = TELEGRAM_PAGE): string[] {
  if (text.length <= limit) return [text]
  const room = limit - 12 // the label
  const pages: string[] = []
  let cur: string[] = []
  let len = 0
  const add = (chunk: string) => {
    if (cur.length && len + 1 + chunk.length > room) {
      pages.push(cur.join("\n"))
      cur = []
      len = 0
    }
    len += (cur.length ? 1 : 0) + chunk.length
    cur.push(chunk)
  }
  for (const line of text.split("\n")) {
    if (line.length <= room) add(line)
    else for (let i = 0; i < line.length; i += room) add(line.slice(i, i + room))
  }
  if (cur.length) pages.push(cur.join("\n"))
  return pages.map((p, i) => `(${km(i + 1)}/${km(pages.length)})\n${p}`)
}

/** Banned in a report: a generic ellipsis that hides items. */
export const TRUNCATION = /…\s*(និង|\+)\s*\d+|and \d+ more|\+\d+ more|… និង [០-៩\d]+ ទៀត/

/** Banned in a report: a country flag (two regional-indicator letters). */
export const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u
