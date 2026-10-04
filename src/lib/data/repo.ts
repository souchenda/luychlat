import type {
  AppNotification,
  Budget,
  BudgetInput,
  InviteLookup,
  Profile,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  Category,
  CategoryInput,
  Debt,
  DebtDisbursement,
  DebtInput,
  DebtRepayment,
  DebtTranche,
  TrancheInput,
  EntryInput,
  RepaymentInput,
  TelegramSettings,
  Tontine,
  TontineCollectInput,
  TontineInput,
  TontinePayInput,
  TontinePayment,
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
  /** Every workspace the user can open (own Personal/Business, plus family ones), with their role. */
  listWorkspaces(): Promise<Workspace[]>

  // --- family sharing ------------------------------------------------------
  /** The current user's display name (shown as "recorded by" to other members). */
  getProfile(): Promise<Profile>
  updateProfile(displayName: string): Promise<Profile>
  /** Creates the user's one family workspace (with personal category presets). */
  createFamilyWorkspace(name: string): Promise<Workspace>
  /** Owner only; removes everything in it. */
  deleteFamilyWorkspace(workspaceId: string): Promise<void>
  /** Owner first, then by join date. */
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>
  /** Owner only. */
  setMemberRole(memberId: string, role: Exclude<WorkspaceRole, "OWNER">): Promise<void>
  /** The owner removes someone, or a member removes themselves (leave). */
  removeMember(memberId: string): Promise<void>
  /** Owner only: a single-use 6-character code, valid for 7 days. */
  createInvite(workspaceId: string, role: Exclude<WorkspaceRole, "OWNER">): Promise<WorkspaceInvite>
  /** Unused, unexpired codes. */
  listInvites(workspaceId: string): Promise<WorkspaceInvite[]>
  revokeInvite(id: string): Promise<void>
  /** Checks a code, and with `accept` joins its workspace. */
  lookupInvite(code: string, accept: boolean): Promise<InviteLookup>

  // --- budgets -------------------------------------------------------------
  listBudgets(workspaceId: string): Promise<Budget[]>
  /** Creates or replaces the cap for that category. */
  saveBudget(workspaceId: string, input: BudgetInput): Promise<Budget>
  deleteBudget(id: string): Promise<void>

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

  // --- tontine (តុងទីន) ----------------------------------------------------
  /** Newest first. */
  listTontines(workspaceId: string): Promise<Tontine[]>
  /** Every paid round of the workspace's tontines. */
  listTontinePayments(workspaceId: string): Promise<TontinePayment[]>
  createTontine(workspaceId: string, input: TontineInput): Promise<Tontine>
  updateTontine(id: string, input: TontineInput): Promise<Tontine>
  setTontineClosed(id: string, closed: boolean): Promise<void>
  /** Removes it and its rounds; ledger rows stay (unlinked). */
  deleteTontine(id: string): Promise<void>
  /** Records the round and, with a wallet, the expense (public.pay_tontine_round). */
  payTontineRound(input: TontinePayInput): Promise<TontinePayment>
  /** Won the bid: records the pot and, with a wallet, the income (public.collect_tontine). */
  collectTontine(input: TontineCollectInput): Promise<Tontine>
  /** Removes a paid round; its expense (if any) is deleted and the wallet refunded. */
  deleteTontinePayment(id: string): Promise<void>
  /** Back to កូនរស់; the pot income (if any) is deleted. */
  undoTontineWin(tontineId: string): Promise<void>

  listDebts(workspaceId: string): Promise<Debt[]>
  /** With `disbursement`, also moves the money (deposit borrowed / pay out lent funds). */
  createDebt(workspaceId: string, input: DebtInput, disbursement?: DebtDisbursement): Promise<Debt>
  /** Currency is fixed once repaid; the total can't drop below what was paid. */
  updateDebt(id: string, input: Partial<DebtInput>): Promise<Debt>
  /** Removes the debt and its repayment records; the ledger rows stay (unlinked). */
  deleteDebt(id: string): Promise<void>
  listRepayments(debtId: string): Promise<DebtRepayment[]>
  /**
   * Atomically records a ledger row (expense for a payable, income for a
   * receivable) and the repayment. Throws RepaymentTooLargeError above the
   * remaining balance.
   */
  recordRepayment(input: RepaymentInput): Promise<DebtRepayment>
  /** Deletes the repayment (and its ledger row, which reverses the wallet) and restores the debt. */
  deleteRepayment(id: string): Promise<void>
  /** Oldest first. */
  listTranches(debtId: string): Promise<DebtTranche[]>
  /** Raises the debt total; with a wallet, also moves the money. */
  addTranche(input: TrancheInput): Promise<DebtTranche>
  /** Lowers the total (never below what was repaid) and undoes the wallet movement. */
  deleteTranche(id: string): Promise<void>

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
