import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { erpSignature } from "@/lib/erp-sync"

import { POST } from "./route"

const SECRET = "k".repeat(48)
const saved = process.env.ERP_SYNC_SECRET
afterEach(() => {
  if (saved === undefined) delete process.env.ERP_SYNC_SECRET
  else process.env.ERP_SYNC_SECRET = saved
})

const call = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/integrations/erp-sync", { method: "POST", body, headers: { "content-type": "application/json", ...headers } }))
const signed = (body: string, ts = String(Math.floor(Date.now() / 1000))) => ({ "x-erp-timestamp": ts, "x-erp-signature": erpSignature(SECRET, ts, body) })

describe("POST /api/integrations/erp-sync — before the database (founder, 26/10/2026 — Task #515)", () => {
  it("503 while ERP_SYNC_SECRET is unset or short — nothing is accepted", async () => {
    delete process.env.ERP_SYNC_SECRET
    assert.equal((await call("{}")).status, 503)
    process.env.ERP_SYNC_SECRET = "short"
    assert.equal((await call("{}")).status, 503)
  })
  it("401 without a signature or with a wrong one; 408 for an old timestamp (a replay)", async () => {
    process.env.ERP_SYNC_SECRET = SECRET
    const body = JSON.stringify({ reference_id: "R1", type: "expense", amount: 5, currency: "USD", category: "ice" })
    assert.equal((await call(body)).status, 401)
    assert.equal((await call(body, { "x-erp-timestamp": String(Math.floor(Date.now() / 1000)), "x-erp-signature": "sha256=" + "0".repeat(64) })).status, 401)
    const old = String(Math.floor(Date.now() / 1000) - 3600)
    assert.equal((await call(body, signed(body, old))).status, 408)
  })
  it("422 for a signed but invalid payload — with the reason, before anything is written", async () => {
    process.env.ERP_SYNC_SECRET = SECRET
    const body = JSON.stringify({ reference_id: "R1", type: "expense", amount: 4500.5, currency: "KHR", category: "ice" })
    const res = await call(body, signed(body))
    assert.equal(res.status, 422)
    assert.match(((await res.json()) as { error: string }).error, /whole riel/)
  })
})
