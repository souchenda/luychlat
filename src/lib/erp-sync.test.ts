import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ERP_MAX_SKEW_MS, erpPreset, erpSignature, parseErpPayload, verifyErpSignature } from "./erp-sync"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const SECRET = "s".repeat(40)
const NOW = Date.parse("2026-10-26T08:00:00Z")
const TS = String(Math.floor(NOW / 1000))
const BODY = JSON.stringify({ reference_id: "OE-1042", type: "expense", amount: 120.5, currency: "USD", category: "stock" })

describe("SL Staff ERP → LuyChlat: the signature (founder, 26/10/2026 — Task #515)", () => {
  it("HMAC-SHA256 of «<timestamp>.<raw body>» with the shared secret, «sha256=<hex>»", () => {
    const sig = erpSignature(SECRET, TS, BODY)
    assert.match(sig, /^sha256=[0-9a-f]{64}$/)
    assert.equal(verifyErpSignature({ secret: SECRET, timestamp: TS, raw: BODY, signature: sig, now: NOW }), "ok")
    assert.equal(verifyErpSignature({ secret: SECRET, timestamp: String(NOW), raw: BODY, signature: erpSignature(SECRET, String(NOW), BODY), now: NOW }), "ok") // ms too
  })
  it("refused: another secret, a changed body or amount, no signature, a malformed timestamp", () => {
    const sig = erpSignature(SECRET, TS, BODY)
    assert.equal(verifyErpSignature({ secret: "x".repeat(40), timestamp: TS, raw: BODY, signature: sig, now: NOW }), "bad")
    assert.equal(verifyErpSignature({ secret: SECRET, timestamp: TS, raw: BODY.replace("120.5", "1205"), signature: sig, now: NOW }), "bad")
    assert.equal(verifyErpSignature({ secret: SECRET, timestamp: TS, raw: BODY, signature: null, now: NOW }), "bad")
    assert.equal(verifyErpSignature({ secret: SECRET, timestamp: "yesterday", raw: BODY, signature: sig, now: NOW }), "bad")
  })
  it("a captured request replayed later (or a clock far off) is stale — 5 minutes either way", () => {
    const old = String(Math.floor((NOW - ERP_MAX_SKEW_MS - 1_000) / 1000))
    assert.equal(verifyErpSignature({ secret: SECRET, timestamp: old, raw: BODY, signature: erpSignature(SECRET, old, BODY), now: NOW }), "stale")
  })
})

describe("SL Staff ERP → LuyChlat: the payload (Task #515)", () => {
  it("create: type, exact amount, currency, category → our preset, note, bank by default; void: the reference only", () => {
    const p = parseErpPayload({ reference_id: "OE-1042", type: "expense", amount: 120.5, currency: "USD", category: "stock", note: "  សាច់ជ្រូក   50kg " })
    assert.deepEqual(p, { ok: true, payload: { action: "create", reference_id: "OE-1042", type: "expense", amount: 120.5, currency: "USD", preset: "inventory", category: "stock", note: "សាច់ជ្រូក 50kg", payment_method: "bank", date: null, bank_ref: null } })
    assert.deepEqual(parseErpPayload({ action: "void", reference_id: "OE-1042" }), { ok: true, payload: { action: "void", reference_id: "OE-1042" } })
    assert.equal((parseErpPayload({ reference_id: "INV-7", type: "income", amount: "10.10", currency: "USD", category: "sales" }) as { payload: { amount: number } }).payload.amount, 10.1) // 10.10 is not refused by floating point
  })
  it("refused with a reason: no reference, an unknown type or currency, riel with decimals, cents beyond 2, ≤ 0, a bad date or method", () => {
    const bad = (b: Record<string, unknown>) => (parseErpPayload({ reference_id: "R1", type: "expense", amount: 5, currency: "USD", category: "x", ...b }) as { ok: boolean; error?: string })
    assert.match(bad({ reference_id: "" }).error ?? "", /reference_id/)
    assert.match(bad({ type: "transfer" }).error ?? "", /type/)
    assert.match(bad({ currency: "THB" }).error ?? "", /currency/)
    assert.match(bad({ currency: "KHR", amount: 4500.5 }).error ?? "", /whole riel/)
    assert.match(bad({ amount: 1.005 }).error ?? "", /2 decimals/)
    assert.match(bad({ amount: 0 }).error ?? "", /positive/)
    assert.match(bad({ date: "26/10/2026" }).error ?? "", /date/)
    assert.match(bad({ payment_method: "card" }).error ?? "", /payment_method/)
    assert.match(bad({ bank_ref: "a b" }).error ?? "", /bank_ref/)
    assert.match(bad({ action: "edit" }).error ?? "", /action/)
    assert.equal(parseErpPayload([1, 2]).ok, false)
  })
  it("categories: ours pass, the ERP's words map to the nearest, the rest is «other» of its kind — never a guess; a draw is a draw", () => {
    assert.deepEqual(["stock", "Stock Purchase", "transport", "fuel", "salary", "staff_food", "ice", "phone", "repairs", "payroll", "marketing", "lottery"].map((c) => erpPreset("expense", c)), [
      "inventory", "inventory", "delivery", "delivery", "payroll", "payroll", "operating", "utilities", "equipment", "payroll", "marketing", "other_expense",
    ])
    assert.deepEqual(["sales", "invoice", "customer_payment", "investment", "stock"].map((c) => erpPreset("income", c)), ["sales", "sales", "sales", "investment", "other_income"])
    assert.equal(erpPreset("owner_draw", "anything"), "owner_draw")
  })
})

describe("SL Staff ERP → LuyChlat: the database and the route (Task #515)", () => {
  const sql = read("supabase/migrations/20270263000000_erp_sync.sql")
  const route = read("src/app/api/integrations/erp-sync/route.ts")
  it("the business workspace only, from the configuration (never the request); an unmapped method / currency refused", () => {
    assert.match(sql, /if ws\.type <> 'BUSINESS' then raise exception 'not_business'/)
    assert.match(sql, /where id = nullif\(cfg\.accounts->>\(v_method \|\| ':' \|\| v_cur\), ''\)::uuid and workspace_id = ws\.id and archived_at is null;\n\s+if w\.id is null then raise exception 'unmapped_account'/)
    assert.doesNotMatch(sql, /p_payload->>'workspace/)
  })
  it("once per ERP reference: a repeat answers «duplicate»; «void» deletes the entry (its Personal mirror with it) and is remembered", () => {
    assert.match(sql, /reference_id\s+text primary key/)
    assert.match(sql, /'duplicate'/)
    assert.match(sql, /delete from public\.transactions where id = ev\.transaction_id and workspace_id = ws\.id;/)
    assert.match(sql, /'already_void'/)
  })
  it("the owner's draw: owner_draw in the business, the same amount into the configured Personal wallet of that currency (same owner)", () => {
    assert.match(sql, /ensure_preset_category\(ws\.id, 'owner_draw', 'EXPENSE'/)
    assert.match(sql, /pws\.type <> 'PERSONAL' or pws\.user_id <> ws\.user_id or pw\.currency::text <> v_cur/)
    assert.match(sql, /'← ' \|\| ws\.name, 'ម្ចាស់ដកចាយ', 'ERP #' \|\| ref/)
    assert.match(sql, /v_when, ws\.user_id, tx\)/) // draw_of = the business entry
    assert.match(sql, /draw_status := 'no_draw_wallet';/)
  })
  it("the route: off without the secret, the signature checked before anything is read; no SoundBox for ERP entries", () => {
    assert.match(route, /if \(!secret \|\| secret\.length < 32\) return NextResponse\.json\(\{ ok: false, status: "not_configured" \}, \{ status: 503 \}\)/)
    assert.ok(route.indexOf("verifyErpSignature(") < route.indexOf("JSON.parse(raw)"))
    // Nothing that can ring is even imported (the SoundBox, the chime, the voice alert, the sale push).
    assert.doesNotMatch(route.split("\n").filter((l) => l.startsWith("import")).join("\n"), /soundbox|payment-chime|voice-alert|web-push/i)
    // docker-compose.yml is not in the Docker build context (.dockerignore): checked where it is.
    if (existsSync(join(process.cwd(), "docker-compose.yml"))) assert.match(read("docker-compose.yml"), /ERP_SYNC_SECRET: \$\{ERP_SYNC_SECRET:-\}/)
  })
})

describe("The ERP is the primary ledger, nothing counted twice (founder, 26/10/2026 — Task #516)", () => {
  const sql = read("supabase/migrations/20270264000000_erp_sync_adopt.sql")
  it("cash, ABA and ACLEDA each book into their DL wallet; a plain «bank» is accepted but maps nowhere (refused, never guessed)", () => {
    const p = parseErpPayload({ reference_id: "CL-77", type: "income", amount: 216000, currency: "KHR", category: "sales", payment_method: "aba", bank_ref: "62992835636" })
    assert.deepEqual(p.ok && p.payload.action === "create" ? [p.payload.payment_method, p.payload.bank_ref] : null, ["aba", "62992835636"])
    assert.equal((parseErpPayload({ reference_id: "X", type: "income", amount: 1, currency: "USD", category: "sales", bank_ref: "4E2394DB" }) as { payload: { bank_ref: string } }).payload.bank_ref, "4e2394db")
    assert.match(sql, /cfg\.accounts->>\(v_method \|\| ':' \|\| v_cur\)/)
  })
  it("the ERP after AUTOBOK / a slip: the same bank reference, amount, currency and kind in the business → taken over, no second entry", () => {
    assert.match(sql, /where t\.workspace_id = ws\.id and lower\(t\.bank_ref\) = v_bref and t\.currency::text = v_cur and t\.amount = v_amount and t\.type::text = v_kind/)
    assert.match(sql, /and not exists \(select 1 from public\.erp_sync_events e where e\.transaction_id = t\.id and e\.voided_at is null\)/)
    assert.match(sql, /'adopted'/)
  })
  it("AUTOBOK / a slip after the ERP: the new entry is kept (the SoundBox rings for its id); the ERP's entry merges into it", () => {
    assert.match(sql, /create trigger erp_adopt_late after insert on public\.transactions\n\s+for each row when \(new\.bank_ref is not null\)/)
    // The mirror and the ERP's record move BEFORE the ERP's entry goes (its delete would take the mirror with it).
    const body = sql.slice(sql.indexOf("create or replace function public.erp_adopt_late()"))
    assert.ok(body.indexOf("update public.transactions set draw_of = new.id where draw_of = e.id;") < body.indexOf("delete from public.transactions where id = e.id;"))
    assert.match(body, /category_id = case when new\.category_id is null or draw_cat then e\.category_id else new\.category_id end/) // a sale keeps its own (the SoundBox's check)
    // The ERP's own insert is never taken for a later payment.
    assert.match(sql, /perform set_config\('luychlat\.erp_apply', '1', true\);/)
    assert.match(body, /if coalesce\(current_setting\('luychlat\.erp_apply', true\), ''\) = '1' then return new; end if;/)
  })
  it("an owner's draw gets its Personal mirror once, also when it took over an entry", () => {
    assert.match(sql, /select id into mirror from public\.transactions where draw_of = tx;\n\s+if mirror is not null then\n\s+draw_status := 'mirrored';/)
  })
})
