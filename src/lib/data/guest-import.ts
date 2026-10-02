import type { SupabaseClient } from "@supabase/supabase-js"

import { roundMoney } from "@/lib/money"
import { useGuestDataStore } from "@/stores/guest-data-store"

import type { GuestData } from "./guest-db"
import { guestReceipts } from "./guest-receipts"
import { walletDeltas } from "./ledger"
import { createSupabaseRepo } from "./supabase-repo"
import type { Transaction, Workspace, WorkspaceType } from "./types"

/** Whatever a retired Guest Mode session left in this browser. */
export function currentGuestData(): GuestData {
  const s = useGuestDataStore.getState()
  return {
    workspaces: s.workspaces,
    wallets: s.wallets,
    categories: s.categories,
    transactions: s.transactions,
    debts: s.debts,
    repayments: s.repayments,
    notifications: s.notifications,
    seededWorkspaceIds: s.seededWorkspaceIds,
    budgets: s.budgets,
    members: s.members,
    tontines: s.tontines,
    tontinePayments: s.tontinePayments,
  }
}

/**
 * Guest Mode was retired (every user signs in). Devices that still hold data
 * from it are offered this one-time move into the account, so nothing is lost.
 *
 * Moves Guest Mode data into the signed-in account (public.import_guest_data).
 * Each guest workspace goes into the account's workspace of the same kind;
 * a guest Family workspace becomes the user's own family workspace.
 */

export type GuestSummary = { wallets: number; transactions: number; debts: number; budgets: number; tontines: number }

export function guestSummary(data: GuestData = currentGuestData()): GuestSummary {
  return {
    wallets: data.wallets.length,
    transactions: data.transactions.length,
    debts: data.debts.length,
    budgets: data.budgets?.length ?? 0,
    tontines: data.tontines?.length ?? 0,
  }
}

export const hasGuestData = (s: GuestSummary) => s.wallets + s.transactions + s.debts + s.budgets + s.tontines > 0

export type ImportPayload = {
  categories: unknown[]
  wallets: unknown[]
  debts: unknown[]
  transactions: unknown[]
  repayments: unknown[]
  budgets: unknown[]
}

/**
 * The payload for one guest workspace. Wallets carry the balance they had
 * before their first transaction, and the ledger is in creation order, so
 * replaying it in the account ends on the same balances.
 */
export function buildImportPayload(
  data: GuestData,
  workspaceId: string,
  receiptPaths: Map<string, string | null> = new Map(),
): ImportPayload {
  const wallets = data.wallets.filter((w) => w.workspace_id === workspaceId)
  const walletIds = new Set(wallets.map((w) => w.id))
  const currencyOf = (id: string) => wallets.find((w) => w.id === id)!.currency
  const transactions = data.transactions
    .filter((t) => t.workspace_id === workspaceId && walletIds.has(t.wallet_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.transaction_date.localeCompare(b.transaction_date))

  const net = new Map<string, number>()
  for (const tx of transactions) {
    for (const { walletId, delta } of walletDeltas(tx, currencyOf)) net.set(walletId, (net.get(walletId) ?? 0) + delta)
  }

  const debts = data.debts.filter((d) => d.workspace_id === workspaceId)
  const debtIds = new Set(debts.map((d) => d.id))
  const txIds = new Set(transactions.map((t) => t.id))
  const receipt = (tx: Transaction) => (tx.receipt_url ? (receiptPaths.get(tx.receipt_url) ?? null) : null)

  return {
    categories: data.categories
      .filter((c) => c.workspace_id === workspaceId)
      .map(({ id, name, type, icon, color, preset_key }) => ({ id, name, type, icon, color, preset_key })),
    wallets: wallets.map((w) => ({
      id: w.id,
      name: w.name,
      currency: w.currency,
      icon: w.icon,
      color: w.color,
      sort_order: w.sort_order,
      archived_at: w.archived_at,
      visibility: w.visibility ?? "SHARED",
      created_at: w.created_at,
      opening_balance: roundMoney(w.balance - (net.get(w.id) ?? 0), w.currency),
    })),
    debts: debts.map((d) => ({
      id: d.id,
      type: d.type,
      party_name: d.party_name,
      contact_phone: d.contact_phone,
      total_amount: d.total_amount,
      currency: d.currency,
      interest_rate: d.interest_rate,
      interest_period: d.interest_period,
      start_date: d.start_date,
      due_date: d.due_date,
      note: d.note,
      created_at: d.created_at,
      disbursement_transaction_id: d.disbursement_transaction_id,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      wallet_id: t.wallet_id,
      to_wallet_id: t.to_wallet_id,
      category_id: t.category_id,
      amount: t.amount,
      to_amount: t.to_amount,
      currency: t.currency,
      type: t.type,
      exchange_rate: t.exchange_rate,
      note: t.note,
      receipt_url: receipt(t),
      transaction_date: t.transaction_date,
      created_at: t.created_at,
      debt_id: t.debt_id && debtIds.has(t.debt_id) ? t.debt_id : null,
    })),
    repayments: data.repayments
      .filter((r) => debtIds.has(r.debt_id) && txIds.has(r.transaction_id))
      .map(({ id, debt_id, wallet_id, amount_paid, payment_date, note, transaction_id, created_at }) => ({
        id,
        debt_id,
        wallet_id,
        amount_paid,
        payment_date,
        note,
        transaction_id,
        created_at,
      })),
    budgets: (data.budgets ?? [])
      .filter((b) => b.workspace_id === workspaceId)
      .map(({ category_id, amount, currency }) => ({ category_id, amount, currency })),
  }
}

/** Tontines of one guest workspace (ids kept; see public.import_guest_tontines). */
export function buildTontinePayload(data: GuestData, workspaceId: string) {
  const tontines = (data.tontines ?? []).filter((t) => t.workspace_id === workspaceId)
  const ids = new Set(tontines.map((t) => t.id))
  return {
    // workspace_id/created_by are set by the account side.
    tontines,
    payments: (data.tontinePayments ?? []).filter((p) => ids.has(p.tontine_id)),
  }
}

export type ImportResult = Record<"categories" | "wallets" | "transactions" | "debts" | "repayments" | "budgets" | "tontines", number>

/** Imports everything, then clears Guest Mode data on this device. */
export async function importGuestData(supabase: SupabaseClient, userId: string): Promise<ImportResult> {
  const data = currentGuestData()
  const repo = createSupabaseRepo(supabase, userId)
  let cloud = await repo.listWorkspaces()
  const own = (type: WorkspaceType) => cloud.find((w) => w.type === type && w.role === "OWNER")

  // Receipt photos move to the account's storage first; a failed upload just drops that photo.
  const receiptPaths = new Map<string, string | null>()
  for (const tx of data.transactions) {
    if (!tx.receipt_url || receiptPaths.has(tx.receipt_url)) continue
    const blob = await guestReceipts.get(tx.receipt_url)
    receiptPaths.set(tx.receipt_url, blob ? await repo.uploadReceipt(blob).catch(() => null) : null)
  }

  const total: ImportResult = { categories: 0, wallets: 0, transactions: 0, debts: 0, repayments: 0, budgets: 0, tontines: 0 }
  for (const guest of data.workspaces) {
    const payload = buildImportPayload(data, guest.id, receiptPaths)
    const tontinePayload = buildTontinePayload(data, guest.id)
    if (!payload.wallets.length && !payload.debts.length && !payload.budgets.length && !tontinePayload.tontines.length) continue
    let target: Workspace | undefined = own(guest.type)
    if (!target && guest.type === "FAMILY") {
      target = await repo.createFamilyWorkspace(guest.name)
      cloud = [...cloud, target]
    }
    if (!target) throw new Error(`No ${guest.type} workspace in this account`)
    const { data: result, error } = await supabase.rpc("import_guest_data", { p_workspace_id: target.id, p_data: payload })
    if (error) throw error
    for (const key of Object.keys(total) as (keyof ImportResult)[]) total[key] += Number((result as ImportResult)[key] ?? 0)
    if (tontinePayload.tontines.length) {
      const tontines = await supabase.rpc("import_guest_tontines", { p_workspace_id: target.id, p_data: tontinePayload })
      if (tontines.error) throw tontines.error
      total.tontines += Number(tontines.data ?? 0)
    }
  }

  await clearGuestData()
  return total
}

/** Removes Guest Mode data and receipt photos from this device. */
export async function clearGuestData() {
  useGuestDataStore.getState().clear()
  await guestReceipts.clear()
}
