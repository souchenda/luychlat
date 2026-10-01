import { uuid } from "@/lib/uuid"
import { dueAlerts, alertText } from "@/lib/alerts"
import {
  ADJUSTMENT_CATEGORY_PRESETS,
  CATEGORY_PRESETS,
  DEBT_CATEGORY_PRESETS,
  DISBURSEMENT_CATEGORY_PRESETS,
  TONTINE_CATEGORY_PRESETS,
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
  PersonalWalletError,
  PlanLimitError,
  RepaymentTooLargeError,
  WalletInUseError,
  type AppNotification,
  type Attribution,
  type Budget,
  type Category,
  type Debt,
  type DebtRepayment,
  type EntryInput,
  type Tontine,
  type TontinePayment,
  type Transaction,
  type TransactionFilter,
  type TransferUpdate,
  type Wallet,
  type Workspace,
  type WorkspaceInvite,
  type WorkspaceMember,
} from "./types"

const store = useGuestDataStore
const now = () => new Date().toISOString()

const me = () => store.getState().profile

/** Mirrors the stamp_created_by trigger. */
const stamp = (): Attribution => ({ created_by: me().id, created_by_name: me().display_name })

/** The guest owns everything on this device; other family members are simulated. */
function withAccess(w: Workspace): Workspace {
  const others = store.getState().members.filter((m) => m.workspace_id === w.id && m.user_id !== me().id && m.role !== "OWNER")
  return { ...w, user_id: me().id, role: "OWNER", member_count: 1 + others.length }
}

/** Mirrors the signup trigger: every user starts with a Personal and a Business workspace. */
function ensureWorkspaces(): Workspace[] {
  const { workspaces } = store.getState()
  if (workspaces.length > 0) return workspaces.map(withAccess)
  const base = { currency_default: "USD" as const, created_at: now(), user_id: me().id, role: "OWNER" as const, member_count: 1 }
  const seeded: Workspace[] = [
    { id: uuid(), name: "ផ្ទាល់ខ្លួន", type: "PERSONAL", ...base },
    { id: uuid(), name: "អាជីវកម្ម", type: "BUSINESS", ...base },
  ]
  store.setState({ workspaces: seeded })
  return seeded
}

const ORDER = { PERSONAL: 0, BUSINESS: 1, FAMILY: 2 } as const

/** Same alphabet as public.create_workspace_invite(). */
function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => alphabet[b % 32]).join("")
}

/** Mirrors public.seed_default_categories(). */
function ensureCategories(workspaceId: string) {
  const state = store.getState()
  if (state.seededWorkspaceIds.includes(workspaceId)) return
  const workspace = state.workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return
  const seeded: Category[] = CATEGORY_PRESETS[workspace.type].map((p) => ({
    id: uuid(),
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

/** Free plan limits (Guest Mode is always Free); mirrors guard_wallet_limit / family_member_limit_reached. */
const GUEST_MAX_WALLETS = 2
const GUEST_MAX_FAMILY_MEMBERS = 1
const activeWalletCount = () => store.getState().wallets.filter((w) => !w.archived_at).length

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
/** Mirrors the transactions_personal_wallet_guard trigger. */
function guardPersonal(...txs: (Transaction | null)[]) {
  for (const tx of txs) {
    if (!tx) continue
    for (const id of [tx.wallet_id, tx.to_wallet_id]) {
      const w = id ? store.getState().wallets.find((x) => x.id === id) : undefined
      if (w?.visibility === "PERSONAL" && w.owner_id && w.owner_id !== me().id) throw new PersonalWalletError()
    }
  }
}

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
  const moneyChanged =
    !before ||
    !after ||
    (["wallet_id", "to_wallet_id", "amount", "to_amount", "currency", "type", "exchange_rate"] as const).some(
      (k) => before[k] !== after[k],
    )
  if (moneyChanged) guardPersonal(before, after)
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
    id: uuid(),
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

function getTontine(id: string): Tontine {
  const tontine = store.getState().tontines.find((t) => t.id === id)
  if (!tontine) throw new Error("Tontine not found")
  return tontine
}

/** Same checks as the tontines table constraints. */
function validateTontine(workspaceId: string, input: Pick<Tontine, "name" | "share_amount" | "total_rounds" | "wallet_id">) {
  if (!input.name.trim()) throw new Error("name is required")
  if (!(input.share_amount > 0)) throw new Error("share must be positive")
  if (!Number.isInteger(input.total_rounds) || input.total_rounds < 2 || input.total_rounds > 100) throw new Error("rounds must be 2–100")
  if (input.wallet_id && getWallet(input.wallet_id).workspace_id !== workspaceId) throw new Error("wallet not in workspace")
}

/** The expense (pay) or income (pot) ledger row for a tontine round. */
function tontineTransaction(
  t: Tontine,
  walletId: string,
  kind: "PAY" | "COLLECT",
  amount: number,
  rate: number | null,
  date: string,
  note: string | null,
  round: number,
): Transaction {
  const wallet = getWallet(walletId)
  if (wallet.workspace_id !== t.workspace_id) throw new Error("wallet not found in this workspace")
  const tx: Transaction = {
    id: uuid(),
    workspace_id: t.workspace_id,
    wallet_id: wallet.id,
    to_wallet_id: null,
    category_id: ensurePresetCategory(t.workspace_id, TONTINE_CATEGORY_PRESETS[kind]),
    amount,
    to_amount: null,
    currency: t.currency,
    type: kind === "PAY" ? "EXPENSE" : "INCOME",
    exchange_rate: wallet.currency === t.currency ? null : rate,
    note: (note?.trim() || `${t.name} · #${round}`).slice(0, 500),
    receipt_url: null,
    transaction_date: new Date(`${date}T12:00:00+07:00`).toISOString(),
    created_at: now(),
    debt_id: null,
    ...stamp(),
  }
  validate(t.workspace_id, tx)
  return tx
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
    return ensureWorkspaces().sort((a, b) => ORDER[a.type] - ORDER[b.type])
  },

  // --- family (other members are simulated on this device) ------------------

  async getProfile() {
    return me()
  },

  async updateProfile(displayName) {
    const profile = { ...me(), display_name: displayName.trim().slice(0, 40) }
    store.setState({ profile })
    return profile
  },

  async createFamilyWorkspace(name) {
    ensureWorkspaces()
    if (store.getState().workspaces.some((w) => w.type === "FAMILY")) throw new Error("family_exists")
    const workspace: Workspace = {
      id: uuid(),
      name: name.trim().slice(0, 60) || "គ្រួសារ",
      type: "FAMILY",
      currency_default: "USD",
      created_at: now(),
      user_id: me().id,
      role: "OWNER",
      member_count: 1,
    }
    store.setState((s) => ({ workspaces: [...s.workspaces, workspace] }))
    return workspace
  },

  async deleteFamilyWorkspace(workspaceId) {
    const target = store.getState().workspaces.find((w) => w.id === workspaceId)
    if (target?.type !== "FAMILY") throw new Error("only the family workspace can be deleted")
    const receipts = store
      .getState()
      .transactions.filter((t) => t.workspace_id === workspaceId && t.receipt_url)
      .map((t) => t.receipt_url!)
    const debtIds = new Set(store.getState().debts.filter((d) => d.workspace_id === workspaceId).map((d) => d.id))
    store.setState((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== workspaceId),
      wallets: s.wallets.filter((w) => w.workspace_id !== workspaceId),
      categories: s.categories.filter((c) => c.workspace_id !== workspaceId),
      transactions: s.transactions.filter((t) => t.workspace_id !== workspaceId),
      debts: s.debts.filter((d) => d.workspace_id !== workspaceId),
      repayments: s.repayments.filter((r) => !debtIds.has(r.debt_id)),
      notifications: s.notifications.filter((n) => n.workspace_id !== workspaceId),
      members: s.members.filter((m) => m.workspace_id !== workspaceId),
      invites: s.invites.filter((i) => i.workspace_id !== workspaceId),
      budgets: s.budgets.filter((b) => b.workspace_id !== workspaceId),
      seededWorkspaceIds: s.seededWorkspaceIds.filter((id) => id !== workspaceId),
    }))
    await Promise.all(receipts.map((r) => guestReceipts.remove(r)))
  },

  async listMembers(workspaceId) {
    const workspace = store.getState().workspaces.find((w) => w.id === workspaceId)
    if (!workspace) return []
    const owner: WorkspaceMember = {
      id: `owner:${workspaceId}`,
      workspace_id: workspaceId,
      user_id: me().id,
      role: "OWNER",
      joined_at: workspace.created_at,
      display_name: me().display_name,
    }
    const others = store
      .getState()
      .members.filter((m) => m.workspace_id === workspaceId && m.user_id !== me().id && m.role !== "OWNER")
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
    return [owner, ...others]
  },

  async setMemberRole(memberId, role) {
    store.setState((s) => ({ members: s.members.map((m) => (m.id === memberId ? { ...m, role } : m)) }))
  },

  async removeMember(memberId) {
    const member = store.getState().members.find((m) => m.id === memberId)
    if (!member) return
    // Like on_member_removed(): their personal wallets become shared.
    store.setState((s) => ({
      members: s.members.filter((m) => m.id !== memberId),
      wallets: s.wallets.map((w) =>
        w.workspace_id === member.workspace_id && w.owner_id === member.user_id ? { ...w, visibility: "SHARED" } : w,
      ),
    }))
  },

  async createInvite(workspaceId, role) {
    const others = store.getState().members.filter((m) => m.workspace_id === workspaceId && m.role !== "OWNER" && m.user_id !== me().id)
    if (others.length >= GUEST_MAX_FAMILY_MEMBERS) throw new PlanLimitError("family")
    const invite: WorkspaceInvite = {
      id: uuid(),
      workspace_id: workspaceId,
      code: inviteCode(),
      role,
      created_at: now(),
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      used_at: null,
    }
    store.setState((s) => ({ invites: [...s.invites, invite] }))
    return invite
  },

  async listInvites(workspaceId) {
    const at = now()
    return store
      .getState()
      .invites.filter((i) => i.workspace_id === workspaceId && !i.used_at && i.expires_at > at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async revokeInvite(id) {
    store.setState((s) => ({ invites: s.invites.filter((i) => i.id !== id) }))
  },

  async lookupInvite(code) {
    // Codes created here belong to the guest's own workspace; joining someone else needs an account.
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
    const invite = store.getState().invites.find((i) => i.code === normalized)
    const workspace = invite && store.getState().workspaces.find((w) => w.id === invite.workspace_id)
    if (!workspace) return { status: "invalid" }
    return { status: "already_member", workspace_id: workspace.id, workspace_name: workspace.name }
  },

  // --- budgets -------------------------------------------------------------

  async listBudgets(workspaceId) {
    return store
      .getState()
      .budgets.filter((b) => b.workspace_id === workspaceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async saveBudget(workspaceId, input) {
    // Same rules as budgets_guard and unique (workspace_id, category_id).
    const category = store.getState().categories.find((c) => c.id === input.category_id)
    if (!category || category.workspace_id !== workspaceId || category.type !== "EXPENSE") {
      throw new Error("budgets apply to expense categories")
    }
    if (!(input.amount > 0)) throw new Error("amount must be positive")
    const existing = store.getState().budgets.find((b) => b.workspace_id === workspaceId && b.category_id === input.category_id)
    const budget: Budget = existing
      ? { ...existing, ...input, updated_at: now() }
      : { id: uuid(), workspace_id: workspaceId, ...input, created_at: now(), updated_at: now() }
    store.setState((s) => ({ budgets: [...s.budgets.filter((b) => b.id !== budget.id), budget] }))
    return budget
  },

  async deleteBudget(id) {
    store.setState((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }))
  },

  // --- wallets -------------------------------------------------------------

  async listWallets(workspaceId) {
    return store
      .getState()
      .wallets.filter((w) => w.workspace_id === workspaceId)
      .sort(bySortOrder)
  },

  async createWallet(workspaceId, input) {
    if (activeWalletCount() >= GUEST_MAX_WALLETS) throw new PlanLimitError("wallets")
    const siblings = store.getState().wallets.filter((w) => w.workspace_id === workspaceId)
    const wallet: Wallet = {
      id: uuid(),
      workspace_id: workspaceId,
      ...input,
      sort_order: siblings.reduce((max, w) => Math.max(max, w.sort_order), -1) + 1,
      archived_at: null,
      created_at: now(),
      owner_id: me().id,
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
    // Same rule as wallets_accounts_owner_guard.
    if (input.visibility !== current.visibility && current.owner_id && current.owner_id !== me().id) {
      throw new PersonalWalletError()
    }
    const next: Wallet = { ...current, ...input, owner_id: current.owner_id }
    patchWallets((w) => (w.id === id ? next : w))
    return next
  },

  async reorderWallets(workspaceId, orderedIds) {
    const position = new Map(orderedIds.map((id, i) => [id, i]))
    patchWallets((w) => (w.workspace_id === workspaceId && position.has(w.id) ? { ...w, sort_order: position.get(w.id)! } : w))
  },

  async setWalletArchived(id, archived) {
    if (!archived && getWallet(id).archived_at && activeWalletCount() >= GUEST_MAX_WALLETS) throw new PlanLimitError("wallets")
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
      id: uuid(),
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
      budgets: s.budgets.filter((b) => b.category_id !== id),
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
      id: uuid(),
      workspace_id: workspaceId,
      to_wallet_id: null,
      to_amount: null,
      created_at: now(),
      debt_id: null,
      ...input,
      ...stamp(),
    }
    validate(workspaceId, tx)
    commit(null, tx)
    return tx
  },

  async createTransfer(input) {
    const from = getWallet(input.wallet_id)
    const tx: Transaction = {
      id: uuid(),
      ...input,
      category_id: null,
      currency: from.currency,
      type: "TRANSFER",
      receipt_url: null,
      created_at: now(),
      debt_id: null,
      ...stamp(),
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
        // Like the FK cascade to tontine_payments and the clear_tontine_win trigger.
        tontinePayments: s.tontinePayments.filter((p) => p.transaction_id !== id),
        tontines: s.tontines.map((t) =>
          t.won_transaction_id === id ? { ...t, won_round: null, won_amount: null, won_bid: null, won_on: null, won_transaction_id: null } : t,
        ),
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

  // --- tontine -------------------------------------------------------------

  async listTontines(workspaceId) {
    return store
      .getState()
      .tontines.filter((t) => t.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async listTontinePayments(workspaceId) {
    return store
      .getState()
      .tontinePayments.filter((p) => p.workspace_id === workspaceId)
      .sort((a, b) => a.round_no - b.round_no)
  },

  async createTontine(workspaceId, input) {
    validateTontine(workspaceId, input)
    const tontine: Tontine = {
      id: uuid(),
      workspace_id: workspaceId,
      ...input,
      won_round: null,
      won_amount: null,
      won_bid: null,
      won_on: null,
      won_transaction_id: null,
      closed_at: null,
      created_by: me().id,
      created_at: now(),
    }
    store.setState((s) => ({ tontines: [...s.tontines, tontine] }))
    return tontine
  },

  async updateTontine(id, input) {
    const current = getTontine(id)
    validateTontine(current.workspace_id, input)
    const maxRound = Math.max(0, current.won_round ?? 0, ...store.getState().tontinePayments.filter((p) => p.tontine_id === id).map((p) => p.round_no))
    if (input.total_rounds < maxRound) throw new Error("round_out_of_range")
    const next = { ...current, ...input }
    store.setState((s) => ({ tontines: s.tontines.map((t) => (t.id === id ? next : t)) }))
    return next
  },

  async setTontineClosed(id, closed) {
    getTontine(id)
    store.setState((s) => ({ tontines: s.tontines.map((t) => (t.id === id ? { ...t, closed_at: closed ? now() : null } : t)) }))
  },

  async deleteTontine(id) {
    store.setState((s) => ({
      tontines: s.tontines.filter((t) => t.id !== id),
      tontinePayments: s.tontinePayments.filter((p) => p.tontine_id !== id),
    }))
  },

  // Mirrors public.pay_tontine_round().
  async payTontineRound(input) {
    const t = getTontine(input.tontine_id)
    if (!(input.amount > 0)) throw new Error("amount must be positive")
    if (input.round_no < 1 || input.round_no > t.total_rounds) throw new Error("round_out_of_range")
    if (input.round_no === t.won_round) throw new Error("round_is_won")
    if (store.getState().tontinePayments.some((p) => p.tontine_id === t.id && p.round_no === input.round_no)) {
      throw new Error("round_paid")
    }
    const tx = input.wallet_id
      ? tontineTransaction(t, input.wallet_id, "PAY", input.amount, input.exchange_rate, input.paid_on, input.note, input.round_no)
      : null
    const payment: TontinePayment = {
      id: uuid(),
      tontine_id: t.id,
      workspace_id: t.workspace_id,
      round_no: input.round_no,
      amount: input.amount,
      discount: Math.max(0, input.discount),
      paid_on: input.paid_on,
      transaction_id: tx?.id ?? null,
      created_at: now(),
    }
    if (tx) commit(null, tx, (s) => ({ tontinePayments: [...s.tontinePayments, payment] }))
    else store.setState((s) => ({ tontinePayments: [...s.tontinePayments, payment] }))
    return payment
  },

  // Mirrors public.collect_tontine().
  async collectTontine(input) {
    const t = getTontine(input.tontine_id)
    if (t.won_round !== null) throw new Error("already_won")
    if (!(input.amount > 0)) throw new Error("amount must be positive")
    if (input.round_no < 1 || input.round_no > t.total_rounds) throw new Error("round_out_of_range")
    if (store.getState().tontinePayments.some((p) => p.tontine_id === t.id && p.round_no === input.round_no)) {
      throw new Error("round_paid")
    }
    const tx = input.wallet_id
      ? tontineTransaction(t, input.wallet_id, "COLLECT", input.amount, input.exchange_rate, input.received_on, input.note, input.round_no)
      : null
    const next: Tontine = {
      ...t,
      won_round: input.round_no,
      won_amount: input.amount,
      won_bid: input.bid && input.bid > 0 ? input.bid : null,
      won_on: input.received_on,
      won_transaction_id: tx?.id ?? null,
    }
    const extra = (s: GuestState) => ({ tontines: s.tontines.map((x) => (x.id === t.id ? next : x)) })
    if (tx) commit(null, tx, extra)
    else store.setState(extra(store.getState()))
    return next
  },

  async deleteTontinePayment(id) {
    const payment = store.getState().tontinePayments.find((p) => p.id === id)
    if (!payment) throw new Error("Payment not found")
    if (payment.transaction_id) await guestRepo.deleteTransaction(payment.transaction_id)
    else store.setState((s) => ({ tontinePayments: s.tontinePayments.filter((p) => p.id !== id) }))
  },

  async undoTontineWin(tontineId) {
    const t = getTontine(tontineId)
    if (t.won_transaction_id) await guestRepo.deleteTransaction(t.won_transaction_id)
    else {
      store.setState((s) => ({
        tontines: s.tontines.map((x) => (x.id === t.id ? { ...x, won_round: null, won_amount: null, won_bid: null, won_on: null } : x)),
      }))
    }
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
        id: uuid(),
        workspace_id: workspaceId,
        ...input,
        paid_amount: 0,
        status: "ACTIVE",
        created_at: now(),
        disbursement_transaction_id: null,
        ...stamp(),
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
      id: uuid(),
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
      ...stamp(),
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
      id: uuid(),
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
      ...stamp(),
    }
    validate(debt.workspace_id, tx)
    const repayment: DebtRepayment = {
      id: uuid(),
      debt_id: debt.id,
      wallet_id: wallet.id,
      amount_paid: input.amount,
      payment_date: input.payment_date,
      note: input.note,
      transaction_id: tx.id,
      created_at: now(),
      ...stamp(),
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
      .notifications.filter((n) => n.workspace_id === workspaceId && (!n.user_id || n.user_id === me().id))
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
          id: uuid(),
          workspace_id: workspaceId,
          debt_id: debt.id,
          title,
          message: body,
          type: "DUE_DATE",
          is_read: false,
          scheduled_at: now(),
          alert_key: stage,
          user_id: null,
          transaction_id: null,
          actor_name: null,
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
