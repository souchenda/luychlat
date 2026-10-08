/**
 * Financial integrity: a shared pool's target is a plan, never cash.
 * (Regression: a new 9 × $100 family pool booked $900 of income nobody paid.)
 * Runs in the Docker build — a failure stops the deploy.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import { cashFlow } from "@/lib/analytics"
import type { Transaction } from "@/lib/data/types"
import { createPoolArgs, isPoolWallet, personalTransactions, personalWallets } from "@/lib/pool-ledger"

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations")
const migrations = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ file: f, sql: readFileSync(path.join(MIGRATIONS, f), "utf8").replace(/\r\n/g, "\n") }))

/** The body of the newest definition of a SQL function across all migrations. */
function latestFunction(name: string): { file: string; header: string; body: string } {
  let found: { file: string; header: string; body: string } | null = null
  for (const m of migrations) {
    const re = new RegExp(`create (?:or replace )?function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "gi")
    for (const match of m.sql.matchAll(re)) found = { file: m.file, header: match[1], body: match[2] }
  }
  assert.ok(found, `no definition of public.${name} in the migrations`)
  return found
}

describe("creating a shared pool with target_amount = 5000 USD", () => {
  const args = createPoolArgs("ws-1", {
    kind: "FESTIVAL",
    title: "Pchum Ben",
    currency: "USD",
    split: "EQUAL",
    members: Array.from({ length: 10 }, (_, i) => ({ name: `Family ${i + 1}`, pledged: 500 })),
    target: 5000,
    start: null,
    end: null,
    unit: "FAMILY",
    // Anything that would book money must be dropped, even if a caller passes it.
    ...({ recordPaid: true, initial_balance: 5000 } as object),
  })

  it("sends no payment, opening balance or 'already paid' flag", () => {
    for (const key of Object.keys(args)) assert.doesNotMatch(key, /record|paid|balance|initial|opening|deposit/i, key)
    assert.equal(args.p_target, 5000)
    for (const m of args.p_members as Record<string, unknown>[]) assert.deepEqual(Object.keys(m).sort(), ["name", "pledged"])
  })

  it("create_pool (latest migration) opens the wallet at 0.00 and books no transaction", () => {
    const fn = latestFunction("create_pool")
    assert.doesNotMatch(fn.header, /record_paid|initial_balance|opening/i, `${fn.file}: create_pool takes a money parameter`)
    assert.doesNotMatch(fn.body, /pool_record_contribution|pool_mark_paid|insert into public\.(transactions|pool_contributions)/i, `${fn.file}: create_pool books money`)
    assert.match(fn.body, /insert into public\.wallets_accounts \([^)]*\bbalance\b[^)]*\)\s*values \(p_workspace_id,[^;]*?\bp_currency, 0,/i, `${fn.file}: the pool wallet must open at 0`)
  })

  it("the database refuses a contribution in the transaction that creates its pool", () => {
    const guard = latestFunction("guard_pool_contribution_at_creation")
    assert.match(guard.body, /created_at = now\(\)/)
    const created = migrations.some((m) => /create trigger pool_contributions_not_at_creation before insert on public\.pool_contributions/i.test(m.sql))
    const dropped = migrations.findLast((m) => /pool_contributions_not_at_creation/i.test(m.sql))?.sql ?? ""
    assert.ok(created, "trigger pool_contributions_not_at_creation is missing")
    assert.match(dropped, /create trigger pool_contributions_not_at_creation/i, "the last migration touching the trigger must (re)create it")
  })

  it("adds 0.00 to monthly income and net worth — even once members really pay", () => {
    const wallets = [
      { id: "cash", icon: "cash", balance: 120, currency: "USD" as const },
      { id: "pool", icon: "pool_festival", balance: 5000, currency: "USD" as const },
    ]
    const tx = (id: string, wallet_id: string, amount: number): Transaction =>
      ({ id, wallet_id, amount, currency: "USD", type: "INCOME", category_id: null, transaction_date: "2026-10-08" }) as unknown as Transaction
    const month = [tx("salary", "cash", 300), ...Array.from({ length: 10 }, (_, i) => tx(`c${i}`, "pool", 500))]

    assert.ok(isPoolWallet(wallets[1]) && !isPoolWallet(wallets[0]))
    const income = cashFlow(personalTransactions(month, wallets), 4000).income
    assert.equal(income.usd, 300)
    assert.deepEqual(personalWallets(wallets).map((w) => w.id), ["cash"])
    assert.equal(personalTransactions(month, wallets).filter((t) => t.wallet_id === "pool").length, 0)
  })
})
