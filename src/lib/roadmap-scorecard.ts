/**
 * The Daily Task Scorecard in the founder's nightly report (founder, 20/10/2026 — «the total number of daily tasks
 * assigned, how many were completed, and how many are stuck along with the exact reasons»). Pure
 * (roadmap-scorecard.test.ts).
 *
 * The source is ROADMAP.md (shipped inside the server image) and the commits deployed today (public.dev_changelog):
 *   completed — an item ticked `[x]` that names a commit deployed today
 *   pending   — an open item (`[/]` or `[ ]`) that names a commit deployed today, or carries a blocker «⛔ reason»
 *
 * Used by the executive summary (lib/report-standard.ts): the owner of each pending item comes from the tag that
 * starts its reason — «⛔ 🟡 ចុច ✅ លើកាត #833», «⛔ ⏳ …», «⛔ ⚙️ …», «⛔ 🟢 …» — and the rest is its next step. An open
 * item deployed today without a reason is 🟢 (live, waiting for the founder's test).
 */
import { ownerTag, type Owner, type Shipped } from "./report-standard"

export type RoadmapState = "done" | "doing" | "todo"

export type RoadmapItem = { section: string; state: RoadmapState; title: string; blocker: string | null; hashes: string[] }

const STATES: Record<string, RoadmapState> = { x: "done", "/": "doing", " ": "todo" }

/** A commit reference: 7–40 hex characters with at least one digit (so an English word such as «decade» is not one). */
const HASH = /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g

/** The items of ROADMAP.md: «- [x] title (hash, hash) ⛔ reason», under their «## » section. */
export function parseRoadmap(md: string): RoadmapItem[] {
  const items: RoadmapItem[] = []
  let section = ""
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const heading = raw.match(/^##\s+(.+)$/)
    if (heading) {
      section = heading[1].trim()
      continue
    }
    const m = raw.match(/^- \[(x|\/| )\] (.+)$/)
    if (!m) continue
    const [body, ...reason] = m[2].split("⛔")
    const blocker = reason.join("⛔").replace(/\s+/g, " ").trim() || null
    const hashes = [...new Set(body.match(HASH) ?? [])]
    const title = body
      .replace(/\*\*|`/g, "")
      .replace(/\s*\((?=[^()]*\b[0-9a-f]{7,40}\b)[^()]*\)\s*$/, "") // the trailing «(commit, commit)»
      .replace(/\s+/g, " ")
      .trim()
    items.push({ section, state: STATES[m[1]], title, blocker, hashes })
  }
  return items
}

export type Pending = { item: RoadmapItem; owner: Owner; action: string }

export type Scorecard = { completed: RoadmapItem[]; pending: Pending[] }

/** The owner and next step of an open item: its tagged reason; untagged → engineering; none and live → 🟢 verify. */
export function pendingOf(item: RoadmapItem, deployedToday: boolean): Pending {
  if (item.blocker) {
    const tagged = ownerTag(item.blocker)
    return tagged ? { item, ...tagged } : { item, owner: "engineering", action: item.blocker }
  }
  if (item.state === "doing" || deployedToday) return { item, owner: "verify", action: "សាកល្បងលើ app.luychlat.com ហើយបញ្ជាក់" }
  return { item, owner: "engineering", action: "ចាប់ផ្ដើមអភិវឌ្ឍ" }
}

/** Today's scorecard from the items and the full hashes of the commits deployed today. */
export function dailyScorecard(items: RoadmapItem[], deployedToday: string[]): Scorecard {
  const today = (i: RoadmapItem) => i.hashes.some((h) => deployedToday.some((full) => full.startsWith(h)))
  const completed = items.filter((i) => i.state === "done" && today(i))
  const pending = items.filter((i) => i.state !== "done" && (today(i) || i.blocker)).map((i) => pendingOf(i, today(i)))
  return { completed, pending }
}

/** The scorecard for the executive summary: today's finished items (highlight candidates), the founder's actions, counts. */
export function summaryParts(s: Scorecard): { done: Shipped[]; actions: string[]; others: { verify: number; external: number; engineering: number } } {
  const count = (o: Owner) => s.pending.filter((p) => p.owner === o).length
  return {
    done: s.completed.map((i) => ({ title: i.title, hashes: i.hashes })),
    actions: s.pending.filter((p) => p.owner === "founder").map((p) => p.action),
    others: { verify: count("verify"), external: count("external"), engineering: count("engineering") },
  }
}
