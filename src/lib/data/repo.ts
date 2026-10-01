import type {
  AppNotification,
  Category,
  CategoryInput,
  Debt,
  DebtDisbursement,
  DebtInput,
  DebtRepayment,
  EntryInput,
  RepaymentInput,
  TelegramSettings,
  Transaction,
  TransactionFilter,
  TransferInput,
  TransferUpdate,
  Wallet,
  WalletInput,
  WalletUpdate,
  Workspace,
} from "./types"

/**
 * Data access used by the UI. Two implementations share these semantics:
 * - guest-repo: Guest Mode, device-only (Zustand + localStorage, receipts in IndexedDB)
 * - supabase-repo: signed-in users, protected by RLS; balances kept by DB triggers
 */
export interface DataRepo {
  listWorkspaces(): Promise<Workspace[]>

  /** All wallets of a workspace, including archived ones, ordered by sort_order. */
  listWallets(workspaceId: string): Promise<Wallet[]>
  createWallet(workspaceId: string, input: WalletInput): Promise<Wallet>
  updateWallet(id: string, input: WalletUpdate): Promise<Wallet>
  reorderWallets(workspaceId: string, orderedIds: string[]): Promise<void>
  setWalletArchived(id: string, archived: boolean): Promise<void>
  /** Throws WalletInUseError when the wallet has transactions. */
  deleteWallet(id: string): Promise<void>
  /**
   * Sets the wallet to its real balance by recording one "balance adjustment"
   * ledger row for the difference (see public.reconcile_wallet). Returns null
   * when the balance already matches.
   */
  reconcileWallet(walletId: string, actualBalance: number, note: string | null): Promise<Transaction | null>

  /** Workspace categories (seeded with presets on first use). */
  listCategories(workspaceId: string): Promise<Category[]>
  createCategory(workspaceId: string, input: CategoryInput): Promise<Category>
  updateCategory(id: string, input: CategoryInput): Promise<Category>
  /** Transactions in this category become uncategorised. */
  deleteCategory(id: string): Promise<void>

  /** Newest first. */
  listTransactions(workspaceId: string, filter?: TransactionFilter): Promise<Transaction[]>
  createEntry(workspaceId: string, input: EntryInput): Promise<Transaction>
  /** Throws InsufficientBalanceError when the source wallet would go negative. */
  createTransfer(input: TransferInput): Promise<Transaction>
  /**
   * Re-applies wallet balances; a transfer can't change into an entry or back.
   * Throws DebtLinkedError when money fields of a debt repayment row change.
   */
  updateTransaction(id: string, input: EntryInput | TransferUpdate): Promise<Transaction>
  /** Reverses the balance effect and removes the receipt (and its debt repayment, if any). */
  deleteTransaction(id: string): Promise<void>
  /**
   * Deletes every transaction of the workspace dated within [from, to) (ISO),
   * reversing balances, repayments and receipts like single deletes. Returns
   * the number of rows removed.
   */
  deleteTransactionsInRange(workspaceId: string, from: string, to: string): Promise<number>

  listDebts(workspaceId: string): Promise<Debt[]>
  /** With `disbursement`, also moves the money (deposit borrowed / pay out lent funds). */
  createDebt(workspaceId: string, input: DebtInput, disbursement?: DebtDisbursement): Promise<Debt>
  /** Currency is fixed once repaid; the total can't drop below what was paid. */
  updateDebt(id: string, input: DebtInput): Promise<Debt>
  /** Removes the debt and its repayment records; the ledger rows stay (unlinked). */
  deleteDebt(id: string): Promise<void>
  listRepayments(debtId: string): Promise<DebtRepayment[]>
  /**
   * Atomically records a ledger row (expense for a payable, income for a
   * receivable) and the repayment. Throws RepaymentTooLargeError above the
   * remaining balance.
   */
  recordRepayment(input: RepaymentInput): Promise<DebtRepayment>
  /** Deletes the repayment's ledger row, which reverses the wallet and the debt. */
  deleteRepayment(id: string): Promise<void>

  /** Newest first. */
  listNotifications(workspaceId: string): Promise<AppNotification[]>
  markNotificationsRead(workspaceId: string): Promise<void>
  /**
   * Creates due-date notifications for this workspace's debts and returns the
   * new ones. Guest Mode only: in the cloud the daily run_debt_alerts() job
   * does this (and the Telegram sending) server-side, so this returns [].
   */
  syncDueAlerts(workspaceId: string): Promise<AppNotification[]>

  getTelegramSettings(): Promise<TelegramSettings | null>
  /** null removes the bot configuration. */
  saveTelegramSettings(settings: TelegramSettings | null): Promise<void>

  /** Stores a (compressed) receipt image; returns the reference saved in receipt_url. */
  uploadReceipt(image: Blob): Promise<string>
  /** Displayable URL for a receipt reference, or null if it no longer exists. */
  getReceiptUrl(ref: string): Promise<string | null>
  deleteReceipt(ref: string): Promise<void>
}
