/**
 * ULTRA "log into any workspace": picks the workspace a chat message is about.
 *   - a workspace's full name anywhere ("… DL MEAT SUPPLY …"),
 *   - or a short tag at the start: its first word or initials ("DL សាំង 20$"),
 *   - or a generic word at the start: ផ្ទាល់ខ្លួន / personal, គ្រួសារ / family,
 *     អាជីវកម្ម / business / ហាង / shop (when there is only one of that type).
 * Otherwise the default (Personal). The matched words are removed from the text
 * so they can't be mistaken for a wallet or category. Pure.
 */

export type RouteWorkspace = { id: string; name: string; type: "PERSONAL" | "BUSINESS" | "FAMILY" }

const GENERIC: Record<RouteWorkspace["type"], string[]> = {
  PERSONAL: ["ផ្ទាល់ខ្លួន", "ខ្លួនឯង", "personal"],
  FAMILY: ["គ្រួសារ", "family"],
  BUSINESS: ["អាជីវកម្ម", "ហាង", "business", "shop"],
}
// Too common to be a tag on their own.
const NOT_TAGS = new Set(["the", "my", "and", "co", "ltd", "shop", "store", "mart", "ហាង"])

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const isLatin = (s: string) => /^[\x20-\x7e]+$/.test(s)

/** Index and length of `word` in `text` (case-insensitive; word edges for Latin), or null. */
function find(text: string, word: string, atStart: boolean): { index: number; length: number } | null {
  const w = word.toLowerCase()
  if (!w) return null
  if (isLatin(w)) {
    const re = new RegExp(`${atStart ? "^" : "(?:^|(?<=[^\\p{L}\\p{N}]))"}${escape(w)}(?=$|[^\\p{L}\\p{N}])`, "iu")
    const m = re.exec(text)
    return m ? { index: m.index, length: m[0].length } : null
  }
  if (atStart) return text.toLowerCase().startsWith(w) ? { index: 0, length: w.length } : null
  const i = text.toLowerCase().indexOf(w)
  return i >= 0 ? { index: i, length: w.length } : null
}

function tags(ws: RouteWorkspace): string[] {
  const words = ws.name.trim().split(/\s+/).filter(Boolean)
  const out: string[] = []
  if (words[0] && words[0].length >= 2 && !NOT_TAGS.has(words[0].toLowerCase())) out.push(words[0])
  if (words.length >= 2 && words.every((w) => isLatin(w))) {
    const initials = words.map((w) => w[0]).join("")
    if (initials.length >= 2) out.push(initials)
  }
  return out
}

export function routeWorkspace<W extends RouteWorkspace>(message: string, workspaces: W[], defaultId: string): { workspace: W; text: string } {
  const text = message.trim()
  const fallback = workspaces.find((w) => w.id === defaultId) ?? workspaces[0]
  type Hit = { ws: W; index: number; length: number; score: number }
  const hits: Hit[] = []
  for (const ws of workspaces) {
    const full = ws.name.trim()
    if (full.length >= 2) {
      const m = find(text, full, false)
      if (m) hits.push({ ws, ...m, score: 1000 + full.length })
    }
    for (const tag of tags(ws)) {
      const m = find(text, tag, true)
      if (m) hits.push({ ws, ...m, score: 500 + tag.length })
    }
    const sameType = workspaces.filter((w) => w.type === ws.type).length
    if (sameType === 1) {
      for (const word of GENERIC[ws.type]) {
        const m = find(text, word, true)
        if (m) hits.push({ ws, ...m, score: 100 + word.length })
      }
    }
  }
  const best = hits.sort((a, b) => b.score - a.score)[0]
  if (!best) return { workspace: fallback, text }
  const rest = (text.slice(0, best.index) + " " + text.slice(best.index + best.length)).replace(/^[\s:,.\-–—]+/, "").replace(/\s{2,}/g, " ").trim()
  return { workspace: best.ws, text: rest || text }
}
