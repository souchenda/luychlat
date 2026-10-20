/**
 * The Reporting Standard (founder, 20/10/2026 — «establish app-wide standards; do not patch piecemeal»): every automated
 * status report to the founder (the nightly report and its Daily Task Scorecard, the end-of-day development report)
 * is built from these pieces, never ad hoc. Pure (report-standard.test.ts); documented in CLAUDE.md › Reporting Standards.
 *
 *   1. ✅ the day's 3–5 key accomplishments at the top (the rest listed in full right after, never dropped);
 *   2. pending work grouped by who acts next, in four fixed sections, in this order —
 *        🟢 deployed, waiting for the founder's test · 🟡 waiting for the founder's action or approval ·
 *        ⏳ waiting for someone outside (an Imam's review, a recording, a licence) · ⚙️ engineering (a build, a script);
 *   3. every pending item numbered 1…N across the sections, each with its bracketed next step «[សកម្មភាព៖ …]»;
 *   4. nothing truncated — no «… and N more», no cut titles; a report over Telegram's limit is sent as numbered parts.
 */

export type Owner = "verify" | "founder" | "external" | "engineering"

export const OWNER_ORDER: readonly Owner[] = ["verify", "founder", "external", "engineering"]

export const OWNER_HEADING: Record<Owner, string> = {
  verify: "🟢 បានដាក់ឱ្យដំណើរការ — រង់ចាំការផ្ទៀងផ្ទាត់ (Deployed & Ready for Verification)",
  founder: "🟡 រង់ចាំសកម្មភាព / ការអនុម័តពីស្ថាបនិក (Awaiting Founder Action / Approval)",
  external: "⏳ រង់ចាំការពិនិត្យពីភាគីខាងក្រៅ (Awaiting External Review)",
  engineering: "⚙️ ការងារបច្ចេកទេសកំពុងរង់ចាំ (Engineering / Tech Pending)",
}

/**
 * The owner tag that starts a reason (ROADMAP.md «⛔ 🟡 ចុច ✅ លើកាត #833»): the emoji of the section. Explicit, never
 * guessed from the words — a reason without one is engineering's to sort out (and a test keeps ROADMAP.md tagged).
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

export type PendingItem = { title: string; owner: Owner; action: string }

/** «[សកម្មភាព៖ …]» — the one next step, in brackets. */
export const actionTag = (action: string) => `[សកម្មភាព៖ ${action.trim() || "—"}]`

/** The pending sections: only those with items, in the fixed order, numbered 1…N across all of them. */
export function pendingSections(items: PendingItem[]): string[] {
  if (!items.length) return ["📌 កិច្ចការកំពុងរង់ចាំ៖ គ្មានទេ 🎉"]
  const lines: string[] = [`📌 កិច្ចការកំពុងរង់ចាំ (${items.length})៖`]
  let n = 0
  for (const owner of OWNER_ORDER) {
    const group = items.filter((i) => i.owner === owner)
    if (!group.length) continue
    lines.push("", `${OWNER_HEADING[owner]} — ${group.length}`)
    for (const i of group) lines.push(`${++n}. ${i.title.trim()} ${actionTag(i.action)}`)
  }
  return lines
}

/** The ✅ header: up to `top` (3–5) key accomplishments first, then every other one — none dropped. */
export function accomplishments(titles: string[], top = 5): string[] {
  const k = Math.min(Math.max(top, 3), 5)
  if (!titles.length) return ["✅ សមិទ្ធផលថ្ងៃនេះ៖ មិនទាន់មានការដាក់ឱ្យដំណើរការថ្មីទេ"]
  const lines = [`✅ សមិទ្ធផលសំខាន់ៗថ្ងៃនេះ (${titles.length})៖`, ...titles.slice(0, k).map((t) => `✅ ${t.trim()}`)]
  if (titles.length > k) lines.push("", `☑️ ផ្សេងទៀតដែលបានសម្រេច (${titles.length - k})៖`, ...titles.slice(k).map((t) => `• ${t.trim()}`))
  return lines
}

/** The ✅ header alone — the 3–5 key accomplishments — for a report that lists every item in full further down. */
export function highlights(titles: string[], top = 5): string[] {
  const k = Math.min(Math.max(top, 3), 5)
  if (!titles.length) return ["✅ សមិទ្ធផលថ្ងៃនេះ៖ មិនទាន់មានការដាក់ឱ្យដំណើរការថ្មីទេ"]
  return ["✅ សមិទ្ធផលសំខាន់ៗថ្ងៃនេះ៖", ...titles.slice(0, k).map((t) => `✅ ${t.trim()}`)]
}

/** Telegram allows 4,096 characters; the room left for the «(១/២)» label and the number mask. */
export const TELEGRAM_PAGE = 3900

const KM = "០១២៣៤៥៦៧៨៩"
const km = (n: number) => String(n).replace(/\d/g, (d) => KM[Number(d)])

/**
 * The report as Telegram messages: one when it fits; otherwise cut between lines (a line longer than a page between
 * characters) into parts labelled «(១/៣)», in order. Every character is kept.
 */
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
