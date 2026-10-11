/**
 * Khmer has no spaces between words, so the browser may break inside a name or a phrase
 * («លុយ» / «ឆ្លាត», «ដាច់» / «ដោយឡែក»). splitKeep marks the parts that must stay on one line
 * (rendered as whitespace-nowrap spans); the rest wraps normally.
 */
export type KeepPart = { text: string; keep: boolean }

export function splitKeep(text: string, keep: RegExp): KeepPart[] {
  const re = new RegExp(keep.source, keep.flags.includes("g") ? keep.flags : keep.flags + "g")
  const parts: KeepPart[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue
    const at = m.index ?? 0
    if (at > last) parts.push({ text: text.slice(last, at), keep: false })
    parts.push({ text: m[0], keep: true })
    last = at + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), keep: false })
  return parts
}

/** Brand names and the copyright mark never split across lines. */
export const BRAND_KEEP = /©\s*\d{4}\s*(?:អេប លុយឆ្លាត|App Luy Chlat)|អេប លុយឆ្លាត|App Luy Chlat/
