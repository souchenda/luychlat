import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"

import type { DataRepo } from "./repo"
import {
  DebtLinkedError,
  InsufficientBalanceError,
  RepaymentTooLargeError,
  WalletInUseError,
  type Category,
  type Debt,
  type DebtRepayment,
  type Transaction,
  type Wallet,
  type Workspace,
} from "./types"

const FOREIGN_KEY_VIOLATION = "23503"
const RECEIPT_BUCKET = "receipts"
const SIGNED_URL_SECONDS = 600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) {
    if (error.message.includes("insufficient_balance")) throw new InsufficientBalanceError()
    if (error.message.includes("exceeds the remaining balance")) throw new RepaymentTooLargeError()
    if (error.message.includes("edited from the debt")) throw new DebtLinkedError()
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

const toDebt = (row: Debt): Debt => ({
  ...row,
  total_amount: Number(row.total_amount),
  paid_amount: Number(row.paid_amount),
  interest_rate: Number(row.interest_rate),
})
const toRepayment = (row: DebtRepayment): DebtRepayment => ({ ...row, amount_paid: Number(row.amount_paid) })

/** Cloud data for signed-in users. Every query is scoped by RLS to auth.uid(). */
export function createSupabaseRepo(supabase: SupabaseClient): DataRepo {
  const walletCurrency = async (id: string) =>
    (unwrap(await supabase.from("wallets_accounts").select("currency").eq("id", id).single()) as Pick<Wallet, "currency">)
      .currency

  const repo: DataRepo = {
    async listWorkspaces() {
      return unwrap(await supabase.from("workspaces").select("*").order("type")) as Workspace[]
    },

    // --- wallets -----------------------------------------------------------

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

    // --- categories (seeded by the signup trigger) --------------------------

    async listCategories(workspaceId) {
      return unwrap(
        await supabase.from("categories").select("*").eq("workspace_id", workspaceId).order("created_at"),
      ) as Category[]
    },

    async createCategory(workspaceId, input) {
      return unwrap(
        await supabase
          .from("categories")
          .insert({ workspace_id: workspaceId, ...input })
          .select()
          .single(),
      ) as Category
    },

    async updateCategory(id, input) {
      const current = unwrap(await supabase.from("categories").select("name").eq("id", id).single()) as Pick<Category, "name">
      // A renamed preset stops being translated.
      const patch = current.name === input.name ? input : { ...input, preset_key: null }
      return unwrap(await supabase.from("categories").update(patch).eq("id", id).select().single()) as Category
    },

    async deleteCategory(id) {
      unwrap(await supabase.from("categories").delete().eq("id", id))
    },

    // --- transactions (balances maintained by the transactions_balance trigger)

    async listTransactions(workspaceId, filter = {}) {
      let query = supabase.from("transactions").select("*").eq("workspace_id", workspaceId)
      if (filter.type) query = query.eq("type", filter.type)
      if (filter.categoryId) query = query.eq("category_id", filter.categoryId)
      if (filter.walletId) {
        if (!UUID.test(filter.walletId)) throw new Error("Invalid wallet id")
        query = query.or(`wallet_id.eq.${filter.walletId},to_wallet_id.eq.${filter.walletId}`)
      }
      if (filter.from) query = query.gte("transaction_date", filter.from)
      if (filter.to) query = query.lt("transaction_date", filter.to)
      query = query.order("transaction_date", { ascending: false }).order("created_at", { ascending: false })
      if (filter.limit) query = query.limit(filter.limit)
      return (unwrap(await query) as Transaction[]).map(toTransaction)
    },

    async createEntry(workspaceId, input) {
      const row = unwrap(
        await supabase
          .from("transactions")
          .insert({ workspace_id: workspaceId, ...input })
          .select()
          .single(),
      ) as Transaction
      return toTransaction(row)
    },

    async createTransfer(input) {
      const currency = await walletCurrency(input.wallet_id)
      const row = unwrap(
        await supabase
          .from("transactions")
          .insert({ ...input, type: "TRANSFER", currency })
          .select()
          .single(),
      ) as Transaction
      return toTransaction(row)
    },

    async updateTransaction(id, input) {
      const before = unwrap(
        await supabase.from("transactions").select("type, receipt_url").eq("id", id).single(),
      ) as Pick<Transaction, "type" | "receipt_url">
      if ((before.type === "TRANSFER") !== (input.type === "TRANSFER")) throw new Error("Can't change transaction kind")
      const patch = input.type === "TRANSFER" ? { ...input, currency: await walletCurrency(input.wallet_id) } : input
      const row = unwrap(await supabase.from("transactions").update(patch).eq("id", id).select().single()) as Transaction
      if (before.receipt_url && before.receipt_url !== row.receipt_url) await repo.deleteReceipt(before.receipt_url)
      return toTransaction(row)
    },

    async deleteTransaction(id) {
      const rows = unwrap(
        await supabase.from("transactions").delete().eq("id", id).select("receipt_url"),
      ) as Pick<Transaction, "receipt_url">[]
      const receipt = rows[0]?.receipt_url
      if (receipt) await repo.deleteReceipt(receipt)
    },

    // --- debts (paid_amount / status derived by the debts_derive trigger) ------

    async listDebts(workspaceId) {
      const rows = unwrap(
        await supabase.from("debts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      ) as Debt[]
      return rows.map(toDebt)
    },

    async createDebt(workspaceId, input) {
      const row = unwrap(
        await supabase
          .from("debts")
          .insert({ workspace_id: workspaceId, ...input })
          .select()
          .single(),
      ) as Debt
      return toDebt(row)
    },

    async updateDebt(id, input) {
      const row = unwrap(await supabase.from("debts").update(input).eq("id", id).select().single()) as Debt
      return toDebt(row)
    },

    async deleteDebt(id) {
      unwrap(await supabase.from("debts").delete().eq("id", id))
    },

    async listRepayments(debtId) {
      const rows = unwrap(
        await supabase
          .from("debt_repayments")
          .select("*")
          .eq("debt_id", debtId)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ) as DebtRepayment[]
      return rows.map(toRepayment)
    },

    async recordRepayment(input) {
      const row = unwrap(
        await supabase.rpc("record_debt_repayment", {
          p_debt_id: input.debt_id,
          p_wallet_id: input.wallet_id,
          p_amount: input.amount,
          p_exchange_rate: input.exchange_rate,
          p_payment_date: input.payment_date,
          p_note: input.note,
        }),
      ) as DebtRepayment
      return toRepayment(row)
    },

    async deleteRepayment(id) {
      const row = unwrap(
        await supabase.from("debt_repayments").select("transaction_id").eq("id", id).single(),
      ) as Pick<DebtRepayment, "transaction_id">
      // Cascades to the repayment; triggers restore the wallet and the debt.
      await repo.deleteTransaction(row.transaction_id)
    },

    // --- receipts: private bucket, receipts/<uid>/<uuid>.jpg -----------------

    async uploadReceipt(image) {
      const { data } = await supabase.auth.getUser()
      if (!data.user) throw new Error("Not signed in")
      const path = `${data.user.id}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, image, { contentType: image.type })
      if (error) throw error
      return path
    },

    async getReceiptUrl(ref) {
      const { data } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(ref, SIGNED_URL_SECONDS)
      return data?.signedUrl ?? null
    },

    async deleteReceipt(ref) {
      await supabase.storage.from(RECEIPT_BUCKET).remove([ref])
    },
  }
  return repo
}
