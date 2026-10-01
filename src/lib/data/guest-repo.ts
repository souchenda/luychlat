import { CATEGORY_PRESETS } from "@/lib/categories/presets"
import { roundMoney } from "@/lib/money"
import { useGuestDataStore } from "@/stores/guest-data-store"

import { guestReceipts } from "./guest-receipts"
import { walletDeltas } from "./ledger"
import type { DataRepo } from "./repo"
import {
  InsufficientBalanceError,
  WalletInUseError,
  type Category,
  type EntryInput,
  type Transaction,
  type TransactionFilter,
  type TransferUpdate,
  type Wallet,
  type Workspace,
} from "./types"

const store = useGuestDataStore
const now = () => new Date().toISOString()

/** Mirrors the signup trigger: every user starts with a Personal and a Business workspace. */
function ensureWorkspaces(): Workspace[] {
  const { workspaces } = store.getState()
  if (workspaces.length > 0) return workspaces
  const seeded: Workspace[] = [
    { id: crypto.randomUUID(), name: "ផ្ទាល់ខ្លួន", type: "PERSONAL", currency_default: "USD", created_at: now() },
    { id: crypto.randomUUID(), name: "អាជីវកម្ម", type: "BUSINESS", currency_default: "USD", created_at: now() },
  ]
  store.setState({ workspaces: seeded })
  return seeded
}

/** Mirrors public.seed_default_categories(). */
function ensureCategories(workspaceId: string) {
  const state = store.getState()
  if (state.seededWorkspaceIds.includes(workspaceId)) return
  const workspace = state.workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return
  const seeded: Category[] = CATEGORY_PRESETS[workspace.type].map((p) => ({
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    name: p.name.km,
    type: p.type,
    icon: p.icon,
    color: p.color,
    preset_key: p.key,
    created_at: now(),
  }))
  store.setState((s) => ({
    categories: [...s.categories, ...seeded],
    seededWorkspaceIds: [...s.seededWorkspaceIds, workspaceId],
  }))
}

function getWallet(id: string): Wallet {
  const wallet = store.getState().wallets.find((w) => w.id === id)
  if (!wallet) throw new Error("Wallet not found")
  return wallet
}

function getTransaction(id: string): Transaction {
  const tx = store.getState().transactions.find((t) => t.id === id)
  if (!tx) throw new Error("Transaction not found")
  return tx
}

function patchWallets(update: (w: Wallet) => Wallet) {
  store.setState((s) => ({ wallets: s.wallets.map(update) }))
}

const bySortOrder = (a: Wallet, b: Wallet) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)

/** Same checks as the table constraints and triggers. */
function validate(workspaceId: string, tx: Transaction) {
  const from = getWallet(tx.wallet_id)
  if (from.workspace_id !== workspaceId) throw new Error("Wallet not in workspace")
  if (!(tx.amount > 0)) throw new Error("Amount must be positive")
  if (tx.type === "TRANSFER") {
    const to = getWallet(tx.to_wallet_id!)
    if (to.workspace_id !== workspaceId || to.id === from.id) throw new Error("Invalid transfer")
    if (tx.currency !== from.currency) throw new Error("Transfer currency must match the source wallet")
    if (!(tx.to_amount! > 0)) throw new Error("Invalid transfer amount")
    if (tx.category_id) throw new Error("Transfers have no category")
    return
  }
  if (tx.currency !== from.currency && !(tx.exchange_rate! > 0)) throw new Error("exchange_rate is required")
  if (tx.category_id) {
    const category = store.getState().categories.find((c) => c.id === tx.category_id)
    if (!category || category.workspace_id !== workspaceId || category.type !== tx.type) {
      throw new Error("category type does not match transaction type")
    }
  }
}

/**
 * Atomically replaces `before` with `after` (either may be null) and moves
 * wallet balances accordingly, like the transactions_balance trigger.
 */
function commit(before: Transaction | null, after: Transaction | null) {
  const { wallets, transactions } = store.getState()
  const currencyOf = (id: string) => wallets.find((w) => w.id === id)!.currency
  const deltas = new Map<string, number>()
  const add = (tx: Transaction, sign: 1 | -1) =>
    walletDeltas(tx, currencyOf).forEach(({ walletId, delta }) =>
      deltas.set(walletId, (deltas.get(walletId) ?? 0) + sign * delta),
    )
  if (before) add(before, -1)
  if (after) add(after, 1)

  const nextWallets = wallets.map((w) =>
    deltas.has(w.id) ? { ...w, balance: roundMoney(w.balance + deltas.get(w.id)!, w.currency) } : w,
  )
  if (after?.type === "TRANSFER" && nextWallets.find((w) => w.id === after.wallet_id)!.balance < 0) {
    throw new InsufficientBalanceError()
  }

  let nextTransactions = before ? transactions.filter((t) => t.id !== before.id) : transactions
  if (after) nextTransactions = [...nextTransactions, after]
  store.setState({ wallets: nextWallets, transactions: nextTransactions })
}

function matches(tx: Transaction, workspaceId: string, f: TransactionFilter) {
  return (
    tx.workspace_id === workspaceId &&
    (!f.type || tx.type === f.type) &&
    (!f.walletId || tx.wallet_id === f.walletId || tx.to_wallet_id === f.walletId) &&
    (!f.categoryId || tx.category_id === f.categoryId) &&
    (!f.from || tx.transaction_date >= f.from) &&
    (!f.to || tx.transaction_date < f.to)
  )
}

export const guestRepo: DataRepo = {
  async listWorkspaces() {
    return ensureWorkspaces()
  },

  // --- wallets -------------------------------------------------------------

  async listWallets(workspaceId) {
    return store
      .getState()
      .wallets.filter((w) => w.workspace_id === workspaceId)
      .sort(bySortOrder)
  },

  async createWallet(workspaceId, input) {
    const siblings = store.getState().wallets.filter((w) => w.workspace_id === workspaceId)
    const wallet: Wallet = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      ...input,
      sort_order: siblings.reduce((max, w) => Math.max(max, w.sort_order), -1) + 1,
      archived_at: null,
      created_at: now(),
    }
    store.setState((s) => ({ wallets: [...s.wallets, wallet] }))
    return wallet
  },

  async updateWallet(id, input) {
    const current = getWallet(id)
    const hasHistory = store.getState().transactions.some((t) => t.wallet_id === id || t.to_wallet_id === id)
    // Same rule as the wallets_accounts_currency_guard trigger.
    if (hasHistory && input.currency !== current.currency) {
      throw new Error("cannot change currency of a wallet with transactions")
    }
    const next: Wallet = { ...current, ...input }
    patchWallets((w) => (w.id === id ? next : w))
    return next
  },

  async reorderWallets(workspaceId, orderedIds) {
    const position = new Map(orderedIds.map((id, i) => [id, i]))
    patchWallets((w) => (w.workspace_id === workspaceId && position.has(w.id) ? { ...w, sort_order: position.get(w.id)! } : w))
  },

  async setWalletArchived(id, archived) {
    patchWallets((w) => (w.id === id ? { ...w, archived_at: archived ? now() : null } : w))
  },

  async deleteWallet(id) {
    if (store.getState().transactions.some((t) => t.wallet_id === id || t.to_wallet_id === id)) {
      throw new WalletInUseError()
    }
    store.setState((s) => ({ wallets: s.wallets.filter((w) => w.id !== id) }))
  },

  // --- categories ----------------------------------------------------------

  async listCategories(workspaceId) {
    ensureCategories(workspaceId)
    return store
      .getState()
      .categories.filter((c) => c.workspace_id === workspaceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async createCategory(workspaceId, input) {
    const category: Category = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      ...input,
      preset_key: null,
      created_at: now(),
    }
    store.setState((s) => ({ categories: [...s.categories, category] }))
    return category
  },

  async updateCategory(id, input) {
    const current = store.getState().categories.find((c) => c.id === id)
    if (!current) throw new Error("Category not found")
    if (input.type !== current.type && store.getState().transactions.some((t) => t.category_id === id)) {
      throw new Error("category type does not match transaction type")
    }
    // A renamed preset stops being translated.
    const renamed = input.name !== current.name
    const next: Category = { ...current, ...input, preset_key: renamed ? null : current.preset_key }
    store.setState((s) => ({ categories: s.categories.map((c) => (c.id === id ? next : c)) }))
    return next
  },

  async deleteCategory(id) {
    store.setState((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      transactions: s.transactions.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)),
    }))
  },

  // --- transactions --------------------------------------------------------

  async listTransactions(workspaceId, filter = {}) {
    const rows = store
      .getState()
      .transactions.filter((t) => matches(t, workspaceId, filter))
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    return filter.limit ? rows.slice(0, filter.limit) : rows
  },

  async createEntry(workspaceId, input) {
    const tx: Transaction = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      to_wallet_id: null,
      to_amount: null,
      created_at: now(),
      ...input,
    }
    validate(workspaceId, tx)
    commit(null, tx)
    return tx
  },

  async createTransfer(input) {
    const from = getWallet(input.wallet_id)
    const tx: Transaction = {
      id: crypto.randomUUID(),
      ...input,
      category_id: null,
      currency: from.currency,
      type: "TRANSFER",
      receipt_url: null,
      created_at: now(),
    }
    validate(input.workspace_id, tx)
    commit(null, tx)
    return tx
  },

  async updateTransaction(id, input: EntryInput | TransferUpdate) {
    const before = getTransaction(id)
    if ((before.type === "TRANSFER") !== (input.type === "TRANSFER")) throw new Error("Can't change transaction kind")
    const after: Transaction =
      input.type === "TRANSFER"
        ? { ...before, ...input, currency: getWallet(input.wallet_id).currency }
        : { ...before, ...input }
    validate(before.workspace_id, after)
    commit(before, after)
    if (before.receipt_url && before.receipt_url !== after.receipt_url) await guestReceipts.remove(before.receipt_url)
    return after
  },

  async deleteTransaction(id) {
    const before = getTransaction(id)
    commit(before, null)
    if (before.receipt_url) await guestReceipts.remove(before.receipt_url)
  },

  // --- receipts ------------------------------------------------------------

  uploadReceipt: (image) => guestReceipts.put(image),
  getReceiptUrl: (ref) => guestReceipts.url(ref),
  deleteReceipt: (ref) => guestReceipts.remove(ref),
}
