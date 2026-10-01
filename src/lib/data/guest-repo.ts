import { roundMoney } from "@/lib/money"
import { useGuestDataStore } from "@/stores/guest-data-store"

import type { DataRepo } from "./repo"
import { InsufficientBalanceError, WalletInUseError, type Transaction, type Wallet, type Workspace } from "./types"

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

function getWallet(id: string): Wallet {
  const wallet = store.getState().wallets.find((w) => w.id === id)
  if (!wallet) throw new Error("Wallet not found")
  return wallet
}

function patchWallets(update: (w: Wallet) => Wallet) {
  store.setState((s) => ({ wallets: s.wallets.map(update) }))
}

const bySortOrder = (a: Wallet, b: Wallet) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)

export const guestRepo: DataRepo = {
  async listWorkspaces() {
    return ensureWorkspaces()
  },

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

  async listTransfers(workspaceId, limit = 20) {
    return store
      .getState()
      .transactions.filter((t) => t.workspace_id === workspaceId && t.type === "TRANSFER")
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
      .slice(0, limit)
  },

  async createTransfer(input) {
    const from = getWallet(input.wallet_id)
    const to = getWallet(input.to_wallet_id)
    if (from.workspace_id !== input.workspace_id || to.workspace_id !== input.workspace_id || from.id === to.id) {
      throw new Error("Invalid transfer")
    }
    if (input.amount > from.balance) throw new InsufficientBalanceError()

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      workspace_id: input.workspace_id,
      wallet_id: from.id,
      to_wallet_id: to.id,
      category_id: null,
      amount: input.amount,
      to_amount: input.to_amount,
      currency: from.currency,
      type: "TRANSFER",
      exchange_rate: input.exchange_rate,
      note: input.note,
      receipt_url: null,
      transaction_date: input.transaction_date,
      created_at: now(),
    }
    // One setState = atomic, like the database trigger.
    store.setState((s) => ({
      transactions: [...s.transactions, transaction],
      wallets: s.wallets.map((w) =>
        w.id === from.id
          ? { ...w, balance: roundMoney(w.balance - input.amount, w.currency) }
          : w.id === to.id
            ? { ...w, balance: roundMoney(w.balance + input.to_amount, w.currency) }
            : w,
      ),
    }))
    return transaction
  },
}
