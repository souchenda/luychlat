import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"

import type { DataRepo } from "./repo"
import { InsufficientBalanceError, WalletInUseError, type Transaction, type Wallet, type Workspace } from "./types"

const FOREIGN_KEY_VIOLATION = "23503"

function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) {
    if (error.message.includes("insufficient_balance")) throw new InsufficientBalanceError()
    throw error
  }
  return data as T
}

// PostgREST may return numeric columns as strings; normalise to numbers.
const toWallet = (row: Wallet): Wallet => ({ ...row, balance: Number(row.balance) })
const toTransaction = (row: Transaction): Transaction => ({
  ...row,
  amount: Number(row.amount),
  to_amount: row.to_amount === null ? null : Number(row.to_amount),
  exchange_rate: row.exchange_rate === null ? null : Number(row.exchange_rate),
})

/** Cloud data for signed-in users. Every query is scoped by RLS to auth.uid(). */
export function createSupabaseRepo(supabase: SupabaseClient): DataRepo {
  return {
    async listWorkspaces() {
      return unwrap(await supabase.from("workspaces").select("*").order("type")) as Workspace[]
    },

    async listWallets(workspaceId) {
      const rows = unwrap(
        await supabase
          .from("wallets_accounts")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("sort_order")
          .order("created_at"),
      ) as Wallet[]
      return rows.map(toWallet)
    },

    async createWallet(workspaceId, input) {
      const last = unwrap(
        await supabase
          .from("wallets_accounts")
          .select("sort_order")
          .eq("workspace_id", workspaceId)
          .order("sort_order", { ascending: false })
          .limit(1),
      ) as { sort_order: number }[]
      const row = unwrap(
        await supabase
          .from("wallets_accounts")
          .insert({ workspace_id: workspaceId, ...input, sort_order: (last[0]?.sort_order ?? -1) + 1 })
          .select()
          .single(),
      ) as Wallet
      return toWallet(row)
    },

    async updateWallet(id, input) {
      const row = unwrap(await supabase.from("wallets_accounts").update(input).eq("id", id).select().single()) as Wallet
      return toWallet(row)
    },

    async reorderWallets(workspaceId, orderedIds) {
      const results = await Promise.all(
        orderedIds.map((id, sort_order) =>
          supabase.from("wallets_accounts").update({ sort_order }).eq("id", id).eq("workspace_id", workspaceId),
        ),
      )
      results.forEach((r) => unwrap(r))
    },

    async setWalletArchived(id, archived) {
      unwrap(
        await supabase
          .from("wallets_accounts")
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq("id", id),
      )
    },

    async deleteWallet(id) {
      const { error } = await supabase.from("wallets_accounts").delete().eq("id", id)
      if (error?.code === FOREIGN_KEY_VIOLATION) throw new WalletInUseError()
      if (error) throw error
    },

    async listTransfers(workspaceId, limit = 20) {
      const rows = unwrap(
        await supabase
          .from("transactions")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("type", "TRANSFER")
          .order("transaction_date", { ascending: false })
          .limit(limit),
      ) as Transaction[]
      return rows.map(toTransaction)
    },

    async createTransfer(input) {
      const from = unwrap(
        await supabase.from("wallets_accounts").select("currency").eq("id", input.wallet_id).single(),
      ) as Pick<Wallet, "currency">
      // Balances are updated by the transactions_balance trigger in the same statement.
      const row = unwrap(
        await supabase
          .from("transactions")
          .insert({ ...input, type: "TRANSFER", currency: from.currency })
          .select()
          .single(),
      ) as Transaction
      return toTransaction(row)
    },
  }
}
