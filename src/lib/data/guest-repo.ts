import { dueAlerts, alertText } from "@/lib/alerts"
import {
  ADJUSTMENT_CATEGORY_PRESETS,
  CATEGORY_PRESETS,
  DEBT_CATEGORY_PRESETS,
  DISBURSEMENT_CATEGORY_PRESETS,
  type CategoryPreset,
} from "@/lib/categories/presets"
import { debtStatus, remaining } from "@/lib/debts"
import { roundMoney } from "@/lib/money"
import { useGuestDataStore } from "@/stores/guest-data-store"

import { guestReceipts } from "./guest-receipts"
import { walletDeltas } from "./ledger"
import type { DataRepo } from "./repo"
import {
  DebtLinkedError,
  InsufficientBalanceError,
  RepaymentTooLargeError,
  WalletInUseError,
  type AppNotification,
  type Category,
  type Debt,
  type DebtRepayment,
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
type GuestState = ReturnType<typeof store.getState>

function commit(
  before: Transaction | null,
  after: Transaction | null,
  extra?: (state: GuestState) => Partial<GuestState>,
) {
  const state = store.getState()
  const { wallets, transactions } = state
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
  store.setState({ ...extra?.(state), wallets: nextWallets, transactions: nextTransactions })
}

/** Mirrors the debts_derive trigger: paid amount and status come from repayments. */
function derive(debt: Debt, repayments: DebtRepayment[]): Debt {
  const paid = repayments.filter((r) => r.debt_id === debt.id).reduce((acc, r) => acc + r.amount_paid, 0)
  const next = { ...debt, paid_amount: roundMoney(paid, debt.currency) }
  return { ...next, status: debtStatus(next) }
}

function getDebt(id: string): Debt {
  const debt = store.getState().debts.find((d) => d.id === id)
  if (!debt) throw new Error("Debt not found")
  return debt
}

/** Mirrors public.ensure_preset_category(). */
function ensurePresetCategory(workspaceId: string, preset: CategoryPreset): string {
  const existing = store
    .getState()
    .categories.find((c) => c.workspace_id === workspaceId && c.preset_key === preset.key)
  if (existing) return existing.id
  const category: Category = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    name: preset.name.km,
    type: preset.type,
    icon: preset.icon,
    color: preset.color,
    preset_key: preset.key,
    created_at: now(),
  }
  store.setState((s) => ({ categories: [...s.categories, category] }))
  return category.id
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

  async reconcileWallet(walletId, actualBalance, note) {
    const wallet = getWallet(walletId)
    // Same rounding as public.reconcile_wallet().
    const diff = roundMoney(actualBalance - wallet.balance, wallet.currency)
    if (diff === 0) return null
    const preset = diff > 0 ? ADJUSTMENT_CATEGORY_PRESETS.IN : ADJUSTMENT_CATEGORY_PRESETS.OUT
    return guestRepo.createEntry(wallet.workspace_id, {
      type: preset.type,
      wallet_id: wallet.id,
      category_id: ensurePresetCategory(wallet.workspace_id, preset),
      amount: Math.abs(diff),
      currency: wallet.currency,
      exchange_rate: null,
      note,
      transaction_date: now(),
      receipt_url: null,
    })
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
      debt_id: null,
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
      debt_id: null,
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
    // Same rule as the transactions_debt_guard trigger.
    if (
      before.debt_id &&
      (after.amount !== before.amount ||
        after.currency !== before.currency ||
        after.wallet_id !== before.wallet_id ||
        after.type !== before.type ||
        after.exchange_rate !== before.exchange_rate)
    ) {
      throw new DebtLinkedError()
    }
    validate(before.workspace_id, after)
    commit(before, after)
    if (before.receipt_url && before.receipt_url !== after.receipt_url) await guestReceipts.remove(before.receipt_url)
    return after
  },

  async deleteTransaction(id) {
    const before = getTransaction(id)
    // Like the FK cascade to debt_repayments + the debt_repayments_rederive trigger.
    commit(before, null, (s) => {
      const repayments = s.repayments.filter((r) => r.transaction_id !== id)
      return {
        repayments,
        debts: s.debts.map((d) =>
          d.id === before.debt_id
            ? derive({ ...d, disbursement_transaction_id: d.disbursement_transaction_id === id ? null : d.disbursement_transaction_id }, repayments)
            : d,
        ),
      }
    })
    if (before.receipt_url) await guestReceipts.remove(before.receipt_url)
  },

  async deleteTransactionsInRange(workspaceId, from, to) {
    const doomed = store
      .getState()
      .transactions.filter((t) => t.workspace_id === workspaceId && t.transaction_date >= from && t.transaction_date < to)
    // Newest first: undoing a later transfer before an earlier income keeps every step valid.
    doomed.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    for (const tx of doomed) await guestRepo.deleteTransaction(tx.id)
    return doomed.length
  },

  // --- debts ---------------------------------------------------------------

  async listDebts(workspaceId) {
    return store
      .getState()
      .debts.filter((d) => d.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async createDebt(workspaceId, input, disbursement) {
    let debt = derive(
      {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        ...input,
        paid_amount: 0,
        status: "ACTIVE",
        created_at: now(),
        disbursement_transaction_id: null,
      },
      [],
    )
    if (!disbursement) {
      store.setState((s) => ({ debts: [...s.debts, debt] }))
      return debt
    }

    // Mirrors public.disburse_debt(): one ledger row moving the full amount.
    const wallet = getWallet(disbursement.wallet_id)
    if (wallet.workspace_id !== workspaceId) throw new Error("wallet not found in this workspace")
    const tx: Transaction = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      wallet_id: wallet.id,
      to_wallet_id: null,
      category_id: ensurePresetCategory(workspaceId, DISBURSEMENT_CATEGORY_PRESETS[debt.type]),
      amount: disbursement.amount ?? debt.total_amount,
      to_amount: null,
      currency: debt.currency,
      type: debt.type === "PAYABLE" ? "INCOME" : "EXPENSE",
      exchange_rate: wallet.currency === debt.currency ? null : disbursement.exchange_rate,
      note: debt.party_name,
      receipt_url: null,
      transaction_date: disbursement.date,
      created_at: now(),
      debt_id: debt.id,
    }
    if (disbursement.amount !== undefined && !(disbursement.amount > 0 && disbursement.amount <= debt.total_amount)) {
      throw new Error("disbursement amount must be between 0 and the debt total")
    }
    validate(workspaceId, tx)
    debt = { ...debt, disbursement_transaction_id: tx.id }
    commit(null, tx, (s) => ({ debts: [...s.debts, debt] }))
    return debt
  },

  async updateDebt(id, input) {
    const current = getDebt(id)
    if (input.currency !== current.currency && current.paid_amount > 0) {
      throw new Error("cannot change currency of a debt with repayments")
    }
    if (input.total_amount < current.paid_amount) throw new Error("total_amount is below the amount already paid")
    const next = derive({ ...current, ...input }, store.getState().repayments)
    store.setState((s) => ({ debts: s.debts.map((d) => (d.id === id ? next : d)) }))
    return next
  },

  async deleteDebt(id) {
    // Repayment records go with the debt; their ledger rows stay, unlinked.
    store.setState((s) => ({
      debts: s.debts.filter((d) => d.id !== id),
      repayments: s.repayments.filter((r) => r.debt_id !== id),
      transactions: s.transactions.map((t) => (t.debt_id === id ? { ...t, debt_id: null } : t)),
    }))
  },

  async listRepayments(debtId) {
    return store
      .getState()
      .repayments.filter((r) => r.debt_id === debtId)
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at))
  },

  async recordRepayment(input) {
    const debt = getDebt(input.debt_id)
    const wallet = getWallet(input.wallet_id)
    if (wallet.workspace_id !== debt.workspace_id) throw new Error("wallet not found in this workspace")
    if (!(input.amount > 0)) throw new Error("amount must be positive")
    if (input.amount > remaining(debt)) throw new RepaymentTooLargeError()

    const tx: Transaction = {
      id: crypto.randomUUID(),
      workspace_id: debt.workspace_id,
      wallet_id: wallet.id,
      to_wallet_id: null,
      category_id: ensurePresetCategory(debt.workspace_id, DEBT_CATEGORY_PRESETS[debt.type]),
      amount: input.amount,
      to_amount: null,
      currency: debt.currency,
      type: debt.type === "PAYABLE" ? "EXPENSE" : "INCOME",
      exchange_rate: wallet.currency === debt.currency ? null : input.exchange_rate,
      note: input.note ?? debt.party_name,
      receipt_url: null,
      transaction_date: input.payment_date,
      created_at: now(),
      debt_id: debt.id,
    }
    validate(debt.workspace_id, tx)
    const repayment: DebtRepayment = {
      id: crypto.randomUUID(),
      debt_id: debt.id,
      wallet_id: wallet.id,
      amount_paid: input.amount,
      payment_date: input.payment_date,
      note: input.note,
      transaction_id: tx.id,
      created_at: now(),
    }
    // One setState: ledger row, wallet balance, repayment and debt together.
    commit(null, tx, (s) => {
      const repayments = [...s.repayments, repayment]
      return { repayments, debts: s.debts.map((d) => (d.id === debt.id ? derive(d, repayments) : d)) }
    })
    return repayment
  },

  async deleteRepayment(id) {
    const repayment = store.getState().repayments.find((r) => r.id === id)
    if (!repayment) throw new Error("Repayment not found")
    await guestRepo.deleteTransaction(repayment.transaction_id)
  },

  // --- notifications -------------------------------------------------------

  async listNotifications(workspaceId) {
    return store
      .getState()
      .notifications.filter((n) => n.workspace_id === workspaceId)
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
  },

  async markNotificationsRead(workspaceId) {
    store.setState((s) => ({
      notifications: s.notifications.map((n) => (n.workspace_id === workspaceId ? { ...n, is_read: true } : n)),
    }))
  },

  async syncDueAlerts(workspaceId) {
    // Same stages and dedupe (debt_id + alert_key) as run_debt_alerts().
    const state = store.getState()
    const language = state.telegram?.language ?? "km"
    const seen = new Set(state.notifications.map((n) => `${n.debt_id}:${n.alert_key}`))
    const created: AppNotification[] = dueAlerts(state.debts.filter((d) => d.workspace_id === workspaceId))
      .filter(({ debt, stage }) => !seen.has(`${debt.id}:${stage}`))
      .map(({ debt, stage }) => {
        const { title, body } = alertText(debt, stage, language)
        return {
          id: crypto.randomUUID(),
          workspace_id: workspaceId,
          debt_id: debt.id,
          title,
          message: body,
          type: "DUE_DATE",
          is_read: false,
          scheduled_at: now(),
          alert_key: stage,
        }
      })
    if (created.length) store.setState((s) => ({ notifications: [...s.notifications, ...created] }))
    return created
  },

  // --- telegram ------------------------------------------------------------

  async getTelegramSettings() {
    return store.getState().telegram
  },

  async saveTelegramSettings(settings) {
    store.setState({ telegram: settings })
  },

  // --- receipts ------------------------------------------------------------

  uploadReceipt: (image) => guestReceipts.put(image),
  getReceiptUrl: (ref) => guestReceipts.url(ref),
  deleteReceipt: (ref) => guestReceipts.remove(ref),
}
