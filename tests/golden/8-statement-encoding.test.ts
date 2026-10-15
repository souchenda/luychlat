// GOLDEN PATH 8 — A bank statement always saves, whatever bytes its PDF carried (founder, 15/10/2026: an
// ABA statement of 35 lines failed with «22P05 unsupported Unicode escape sequence» — NUL bytes from a
// custom font). PostgreSQL rejects \u0000 when it reads the request's JSON, before any function runs, so
// the text must be clean before it is sent: in the statement parser, on the import payload, and in the
// fetch of EVERY Supabase client in the app.
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { afterEach, describe, it } from "node:test"

import { deepCleanText } from "../../src/lib/clean-text"
import { buildStatement, guessMapping } from "../../src/lib/reconcile/parse"
import { cleanFetch } from "../../src/lib/supabase/clean-fetch"

const NUL = "\u0000"
// ABA-shaped rows as pdfPagesToRows builds them — the descriptions carrying what the PDF's font left in.
const ROWS = [
  ["Date", "Description", "Reference", "Money In", "Money Out", "Balance"],
  ["01/10/2026", `Funds received from SOK${NUL} DARA`, `REF${NUL}123`, "1,250.00", "", "5,250.00"],
  ["02/10/2026", `ABA PAY TO ក្រុមហ៊ុន ${NUL}អគ្គិសនី\\u0000`, "REF124", "", "45.50", "5,204.50"],
  ["03/10/2026", `Purchase CAFE \uD83D${NUL}`, "REF125", "", "3.00", "5,201.50"],
]
const nothingPgRejects = (s: string) => !s.includes(NUL) && !/\\u0000/i.test(s) && !/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe("GOLDEN 8 · bank statements never fail on their bytes (22P05)", () => {
  it("the parser cleans each line's description and reference", () => {
    const mapping = guessMapping(ROWS)
    assert.ok(mapping)
    const { lines } = buildStatement(ROWS, mapping!, 2)
    assert.equal(lines.length, 3)
    for (const l of lines) {
      assert.ok(nothingPgRejects(l.description), l.description)
      assert.ok(!l.bank_ref || nothingPgRejects(l.bank_ref))
    }
    assert.equal(lines[0].description, "Funds received from SOK DARA")
    assert.ok(lines[1].description.includes("ក្រុមហ៊ុន អគ្គិសនី"))
  })

  it("the whole import payload, even built from raw text, reaches the network clean — and stays valid JSON", async () => {
    let sent = ""
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body ?? "")
      return new Response("{}", { status: 200 })
    }) as typeof fetch
    const raw = { p_wallet_id: "w", p_meta: { adjust_note: `note${NUL}` }, p_lines: ROWS.slice(1).map((r, i) => ({ line_no: i + 1, description: r[1], bank_ref: r[2] })) }
    await cleanFetch("https://x.supabase.co/rest/v1/rpc/import_statement", { method: "POST", body: JSON.stringify(raw) })
    assert.ok(!sent.includes("\\u0000") && !sent.includes(NUL), sent)
    const parsed = JSON.parse(sent) as { p_lines: { description: string }[] }
    assert.equal(parsed.p_lines.length, 3)
    assert.deepEqual(parsed, deepCleanText(raw))
  })

  it("sign-in calls pass untouched (a password is never altered)", async () => {
    let sent = ""
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body ?? "")
      return new Response("{}", { status: 200 })
    }) as typeof fetch
    const body = JSON.stringify({ password: `p${NUL}w` })
    await cleanFetch("https://x.supabase.co/auth/v1/token?grant_type=password", { method: "POST", body })
    assert.equal(sent, body)
  })

  it("every Supabase client in the app sends through the cleaning fetch — a new one without it fails here", () => {
    const root = join(process.cwd(), "src")
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n)
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
      })
    const offenders: string[] = []
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8")
      for (const m of src.matchAll(/create(?:Browser|Server)?Client\(/g)) {
        const call = src.slice(m.index!, m.index! + 400)
        if (!/cleanFetch|withCleanFetch/.test(call)) offenders.push(relative(root, file).replace(/\\/g, "/"))
      }
    }
    assert.deepEqual(offenders, [])
  })
})
