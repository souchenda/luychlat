/**
 * Financial integrity: marking an entry reconciled (or editing its note / tag) never touches
 * balances — so it can't be refused. (Regression 08/10: a statement save failed with
 * "insufficient_balance" because matching a transfer out of a wallet the statement had just
 * taken below zero re-ran the transfer's balance check.) A new transfer is still checked.
 * Runs in the Docker build — a failure stops the deploy.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations")
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8").replace(/\r\n/g, "\n"))

/** The body of the newest definition of a SQL function across all migrations. */
function latest(name: string): string {
  let body: string | null = null
  for (const m of sql) for (const match of m.matchAll(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "gi"))) body = match[1]
  assert.ok(body, `no definition of public.${name}`)
  return body
}

describe("balances on a transaction update", () => {
  const body = latest("on_transaction_change")
  it("an update with no money change returns before any balance work", () => {
    const guard = body.search(/if tg_op = 'UPDATE'\s+and \(new\.wallet_id, new\.to_wallet_id, new\.amount, new\.to_amount, new\.currency, new\.type, new\.exchange_rate\)\s+is not distinct from \(old\.wallet_id, old\.to_wallet_id, old\.amount, old\.to_amount, old\.currency, old\.type, old\.exchange_rate\) then\s+return null;/)
    assert.ok(guard >= 0, "the no-money-change early return is missing")
    assert.ok(guard < body.indexOf("adjust_wallet_balances"), "the early return must come before the balance adjustments")
  })
  it("inserts and real changes still go through the balance adjustment (and its checks)", () => {
    assert.match(body, /perform public\.adjust_wallet_balances\(old, -1\)/)
    assert.match(body, /perform public\.adjust_wallet_balances\(new, 1\)/)
    assert.match(latest("adjust_wallet_balances"), /insufficient_balance/)
  })
})
