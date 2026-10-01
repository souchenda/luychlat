/** Row shapes mirror supabase/migrations (guideline §3). */

export type Currency = "USD" | "KHR"
export type WorkspaceType = "PERSONAL" | "BUSINESS"
export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"

export type Workspace = {
  id: string
  name: string
  type: WorkspaceType
  currency_default: Currency
  created_at: string
}

export type Wallet = {
  id: string
  workspace_id: string
  name: string
  balance: number
  currency: Currency
  /** Provider preset key, see lib/wallets/providers.ts */
  icon: string | null
  color: string | null
  sort_order: number
  archived_at: string | null
  created_at: string
}

export type Transaction = {
  id: string
  workspace_id: string
  wallet_id: string
  to_wallet_id: string | null
  category_id: string | null
  amount: number
  to_amount: number | null
  currency: Currency
  type: TransactionType
  exchange_rate: number | null
  note: string | null
  receipt_url: string | null
  transaction_date: string
  created_at: string
  /** Set when this row is a debt repayment; edit it from the debt. */
  debt_id: string | null
}

export type CategoryType = Exclude<TransactionType, "TRANSFER">

export type DebtType = "PAYABLE" | "RECEIVABLE"
export type DebtStatus = "ACTIVE" | "PARTIALLY_PAID" | "SETTLED" | "OVERDUE"
export type InterestPeriod = "YEAR" | "MONTH"

export type Debt = {
  id: string
  workspace_id: string
  type: DebtType
  party_name: string
  contact_phone: string | null
  total_amount: number
  /** Derived from repayments (never written by the app). */
  paid_amount: number
  currency: Currency
  /** Percent per `interest_period`; informational (simple interest estimate). */
  interest_rate: number
  interest_period: InterestPeriod
  start_date: string
  /** yyyy-MM-dd, local calendar date. */
  due_date: string | null
  /** Stored status; OVERDUE also depends on today, see lib/debts.ts. */
  status: DebtStatus
  note: string | null
  created_at: string
  /** Ledger row created when the debt was opened with "move money", if any. */
  disbursement_transaction_id: string | null
}

/** Optional money movement when a debt is created (see public.disburse_debt). */
export type DebtDisbursement = {
  wallet_id: string
  /** KHR per 1 USD; required when the wallet uses the other currency. */
  exchange_rate: number | null
  date: string
  /** Amount moved (debt currency); defaults to the full total. A calculator loan moves only the principal. */
  amount?: number
}

export type NotificationType = "DUE_DATE" | "SYSTEM" | "AI_ADVICE"
/** D7: 4–7 days left · D3: 1–3 days · D0: due today · OVERDUE (see lib/alerts.ts). */
export type AlertKey = "D7" | "D3" | "D0" | "OVERDUE"

export type AppNotification = {
  id: string
  workspace_id: string
  debt_id: string | null
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  scheduled_at: string
  alert_key: AlertKey | null
}

export type TelegramSettings = {
  bot_token: string
  chat_id: string
  enabled: boolean
  language: "km" | "en"
}

export type DebtInput = {
  type: DebtType
  party_name: string
  contact_phone: string | null
  total_amount: number
  currency: Currency
  interest_rate: number
  interest_period: InterestPeriod
  start_date: string
  due_date: string | null
  note: string | null
}

export type DebtRepayment = {
  id: string
  debt_id: string
  wallet_id: string
  /** In the debt currency. */
  amount_paid: number
  payment_date: string
  note: string | null
  transaction_id: string
  created_at: string
}

export type RepaymentInput = {
  debt_id: string
  wallet_id: string
  /** In the debt currency. */
  amount: number
  /** KHR per 1 USD; required when the wallet uses the other currency. */
  exchange_rate: number | null
  payment_date: string
  note: string | null
}

export type Category = {
  id: string
  workspace_id: string
  name: string
  type: CategoryType
  /** Key into lib/categories/icons.ts */
  icon: string | null
  color: string | null
  /** Seeded preset; its label is translated until the user renames it. */
  preset_key: string | null
  created_at: string
}

export type CategoryInput = {
  name: string
  type: CategoryType
  icon: string
  color: string
}

/** Income or expense. `amount`/`currency` are as entered; the wallet may use the other currency. */
export type EntryInput = {
  type: CategoryType
  wallet_id: string
  category_id: string | null
  amount: number
  currency: Currency
  /** KHR per 1 USD; required when `currency` differs from the wallet's. */
  exchange_rate: number | null
  note: string | null
  transaction_date: string
  receipt_url: string | null
}

export type TransactionFilter = {
  /** Inclusive ISO lower bound on transaction_date. */
  from?: string
  /** Exclusive ISO upper bound on transaction_date. */
  to?: string
  /** Matches either side of a transfer. */
  walletId?: string
  categoryId?: string
  type?: TransactionType
  limit?: number
}

/** Editable wallet fields; the balance only changes through ledger entries (or Reconcile). */
export type WalletUpdate = Omit<WalletInput, "balance">

export type WalletInput = {
  name: string
  icon: string
  color: string | null
  currency: Currency
  balance: number
}

/** Transfer update payload (workspace is fixed). */
export type TransferUpdate = Omit<TransferInput, "workspace_id"> & { type: "TRANSFER" }

export type TransferInput = {
  workspace_id: string
  wallet_id: string
  to_wallet_id: string
  amount: number
  to_amount: number
  exchange_rate: number | null
  note: string | null
  transaction_date: string
}

/** Thrown when deleting a wallet that still has transactions; archive it instead. */
export class WalletInUseError extends Error {
  constructor() {
    super("Wallet has transactions")
    this.name = "WalletInUseError"
  }
}

/** Thrown when a repayment exceeds what is left on the debt. */
export class RepaymentTooLargeError extends Error {
  constructor() {
    super("Amount exceeds the remaining balance")
    this.name = "RepaymentTooLargeError"
  }
}

/** Thrown when editing a ledger row that belongs to a debt repayment. */
export class DebtLinkedError extends Error {
  constructor() {
    super("Debt repayment transactions are edited from the debt")
    this.name = "DebtLinkedError"
  }
}

/** Thrown when a transfer would overdraw the source wallet. */
export class InsufficientBalanceError extends Error {
  constructor() {
    super("Insufficient balance")
    this.name = "InsufficientBalanceError"
  }
}
