/**
 * Shared pools and the owner's own money — kept apart. Pure (regression-tested in
 * tests/financial-integrity/pool-target-isolation.test.ts).
 *
 * - A pool's target is a plan: creating a pool sends shares and a target, never a
 *   payment or an opening balance (createPoolArgs).
 * - A pool's wallet holds the group's money in custody (create_pool gives it the
 *   icon "pool_<kind>"): its contributions are not the owner's income, and its
 *   balance is not the owner's net worth.
 */

/** A pool's custodial wallet (create_pool marks it with the icon "pool_<kind>"). */
export const isPoolWallet = (w: { icon?: string | null }) => (w.icon ?? "").startsWith("pool_")

/** The owner's own wallets: everything except pool wallets. */
export function personalWallets<W extends { icon?: string | null }>(wallets: W[]): W[] {
  return wallets.filter((w) => !isPoolWallet(w))
}

/** Entries in the owner's own wallets (pool contributions and spending left out). */
export function personalTransactions<T extends { wallet_id: string }>(transactions: T[], wallets: { id: string; icon?: string | null }[]): T[] {
  const pool = new Set(wallets.filter(isPoolWallet).map((w) => w.id))
  return pool.size ? transactions.filter((t) => !pool.has(t.wallet_id)) : transactions
}

export type NewPoolInput = {
  kind: string
  title: string
  currency: "USD" | "KHR"
  split: "EQUAL" | "CUSTOM"
  members: { name: string; pledged: number }[]
  target: number | null
  start: string | null
  end: string | null
  unit?: "PERSON" | "FAMILY"
  template?: "pchumben" | null
}

/**
 * The create_pool call: who shares and the target — nothing that books money
 * (no "already paid", no opening balance). Any such field on the input is dropped.
 */
export function createPoolArgs(workspaceId: string, pool: NewPoolInput): Record<string, unknown> {
  return {
    p_workspace_id: workspaceId,
    p_kind: pool.kind,
    p_title: pool.title,
    p_currency: pool.currency,
    p_split: pool.split,
    p_members: pool.members.map((m) => ({ name: m.name, pledged: m.pledged })),
    p_target: pool.target,
    p_start: pool.start,
    p_end: pool.end,
    p_unit: pool.unit ?? "PERSON",
    p_template: pool.template ?? null,
  }
}
