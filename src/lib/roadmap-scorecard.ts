/**
 * The Daily Task Scorecard in the founder's nightly report (founder, 20/10/2026 — «the total number of daily tasks
 * assigned, how many were completed, and how many are stuck along with the exact reasons»). Pure
 * (roadmap-scorecard.test.ts).
 *
 * The source is ROADMAP.md (shipped inside the server image) and the commits deployed today (public.dev_changelog):
 *   completed — an item ticked `[x]` that names a commit deployed today
 *   stuck / pending — an open item (`[/]` or `[ ]`) that names a commit deployed today, or carries a blocker
 *                     «⛔ reason» (written in ROADMAP.md in Khmer, e.g. «⛔ រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ»)
 */

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

export type Scorecard = { completed: RoadmapItem[]; stuck: { item: RoadmapItem; reason: string }[] }

/** Today's scorecard from the items and the full hashes of the commits deployed today. */
export function dailyScorecard(items: RoadmapItem[], deployedToday: string[]): Scorecard {
  const today = (i: RoadmapItem) => i.hashes.some((h) => deployedToday.some((full) => full.startsWith(h)))
  const completed = items.filter((i) => i.state === "done" && today(i))
  const stuck = items
    .filter((i) => i.state !== "done" && (today(i) || i.blocker))
    .map((item) => ({
      item,
      reason: item.blocker ?? (item.state === "doing" ? "បានដាក់ឱ្យដំណើរការ — រង់ចាំការផ្ទៀងផ្ទាត់ ឬការអនុម័ត" : "មិនទាន់ចាប់ផ្ដើម"),
    }))
  return { completed, stuck }
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The section of the nightly report (plain text, as the rest of the report); at most `max` lines per list. */
export function scorecardText(s: Scorecard, max = 15): string {
  const more = (n: number) => (n > max ? [`   … និង ${n - max} ទៀត`] : [])
  return [
    "📋 វឌ្ឍនភាពកិច្ចការងារថ្ងៃនេះ (Daily Task Scorecard)៖",
    `• ការងារសរុបថ្ងៃនេះ៖ ${s.completed.length + s.stuck.length} កិច្ចការ`,
    `• សម្រេចបាន (Completed)៖ ${s.completed.length} កិច្ចការ`,
    ...s.completed.slice(0, max).map((i) => `   ✅ ${short(i.title, 80)}`),
    ...more(s.completed.length),
    `• គាំង / មិនទាន់បញ្ចប់ (Stuck / Pending)៖ ${s.stuck.length} កិច្ចការ`,
    ...s.stuck.slice(0, max).map(({ item, reason }) => `   ⏳ ${short(item.title, 70)} — ${short(reason, 70)}`),
    ...more(s.stuck.length),
  ].join("\n")
}
