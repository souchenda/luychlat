// Text that PostgreSQL can store (founder, 15/10/2026: an ABA statement of 35 lines failed to save with
// «22P05 unsupported Unicode escape sequence» — PDF text carried NUL bytes from a custom font). Postgres
// rejects \u0000 in text and jsonb, and a lone UTF-16 surrogate in JSON; invisible control characters are
// noise in any field. One cleaner, used by every Supabase client (supabase/clean-fetch.ts) and where raw
// statement / receipt text is first read. Pure (clean-text.test.ts).

/** NUL and the other C0 controls except tab / line feed / carriage return, and DEL. */
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
/** A high surrogate without its low half, or a low one without its high half. */
const LONE_SURROGATES = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
/** The six characters «\u0000» left in extracted text (a font's escape copied as text). */
const ESCAPED_NUL = /\\u0000/gi

export function cleanText(s: string): string {
  return s.replace(ESCAPED_NUL, "").replace(CONTROLS, "").replace(LONE_SURROGATES, "")
}

/** Every string in a JSON-like value cleaned (object keys too); other values unchanged. */
export function deepCleanText<T>(value: T): T {
  if (typeof value === "string") return cleanText(value) as T
  if (Array.isArray(value)) return value.map((v) => deepCleanText(v)) as T
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[cleanText(k)] = deepCleanText(v)
    return out as T
  }
  return value
}

/**
 * A request body as sent to Supabase: JSON is parsed, cleaned and written back (exact — no regex on
 * escaped text); anything else keeps its bytes, with raw NUL characters removed.
 */
export function cleanJsonBody(body: string): string {
  const head = body.trimStart()[0]
  if (head === "{" || head === "[") {
    try {
      return JSON.stringify(deepCleanText(JSON.parse(body)))
    } catch {
      // not JSON after all: fall through
    }
  }
  return body.replace(/\u0000/g, "")
}
