/**
 * What a published tip must be (founder, 14/10/2026 — a one-line comment «គ្រប់ចំនួន មិនមែនពេញចំនួនទេ»
 * went out at 12:00 as a tip): a clear title, and a complete, actionable insight of at least two
 * sentences. Used by the tip dataset's test, and shown as warnings on a «✏️ កែអត្ថបទ» proposal before
 * it can be applied. Pure (tip-quality.test.ts).
 */

/** Khmer sentences end with «។» (or ! / ?); a trailing fragment without one counts too. */
export const sentencesOf = (text: string) =>
  text
    .split(/(?<=[។!?])\s*/u)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[។!?\s]/gu, "").length > 0)

/** The problems with a tip's text, in plain Khmer (empty = fine). */
export function tipTextIssues(title: string, body: string): string[] {
  const issues: string[] = []
  const t = title.trim()
  const b = body.trim()
  if (t.length < 4) issues.push("ចំណងជើងខ្លីពេក ឬគ្មាន")
  if (/^(ឬ|និង|តែ|ប៉ុន្តែ|ហើយ|or\b|and\b|but\b)/iu.test(t)) issues.push("ចំណងជើងចាប់ផ្តើមដោយពាក្យភ្ជាប់ («ឬ», «និង»…) — មិនពេញលេញ")
  if (sentencesOf(b).length < 2) issues.push("ការពន្យល់ត្រូវមានយ៉ាងតិច ២ ឃ្លាពេញ (បញ្ចប់ដោយ «។»)")
  if (b.length < 40) issues.push("ការពន្យល់ខ្លីពេក — ហាក់ដូចជាមតិ ឬការកែ មិនមែនគន្លឹះ")
  if (b && !/[។!?]$/u.test(b)) issues.push("ការពន្យល់មិនបញ្ចប់ដោយ «។»")
  return issues
}

/**
 * Strict review (founder, 14/10/2026): a tip whose text was edited (it no longer matches its entry in
 * the tip dataset — a ✏️ reply, an app edit) or that fails the quality rule is never auto-published at
 * 12:00; only the founder's ✅ sends it.
 */
export function needsFounderApproval(t: { tip_id: string | null; title: string; body: string }, dataset: { id: string; title: { km: string }; body: { km: string } }[]): boolean {
  const original = dataset.find((d) => d.id === t.tip_id)
  const edited = !original || original.title.km.trim() !== t.title.trim() || original.body.km.trim() !== t.body.trim()
  return edited || tipTextIssues(t.title, t.body).length > 0
}
