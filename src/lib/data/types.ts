/** Row shapes mirror supabase/migrations (guideline §3). */

export type Currency = "USD" | "KHR"
export type WorkspaceType = "PERSONAL" | "BUSINESS" | "FAMILY"
/** OWNER manages members; MEMBER reads and writes; VIEWER only reads. */
export type WorkspaceRole = "OWNER" | "MEMBER" | "VIEWER"
/** SHARED: anyone who can write may use it. PERSONAL: everyone sees it, only its owner moves money. */
export type WalletVisibility = "SHARED" | "PERSONAL"
export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"

export type Workspace = {
  id: string
  name: string
  type: WorkspaceType
  currency_default: Currency
  created_at: string
  /** The owner (creator). */
  user_id: string
  /** The current user's role here. */
  role: WorkspaceRole
  /** Number of people with access (1 unless shared). */
  member_count: number
  /** KHR per 1 USD saved for this workspace (null = not set yet: the default applies). */
  khr_per_usd?: number | null
  /** Business profile (BUSINESS workspaces): logo storage path and contact details. */
  logo_path?: string | null
  business_phone?: string | null
  business_address?: string | null
  business_industry?: string | null
  /** Why the owner's plan makes this read-only: the Free business trial ended, or more businesses than the plan allows. */
  locked?: "TRIAL_ENDED" | "PLAN_LIMIT" | null
  /** Free plan: end of the business trial (ISO). */
  trial_ends_at?: string | null
  trial_started_at?: string
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
  visibility: WalletVisibility
  /** Who created it; for a PERSONAL wallet, the only person who may use it. */
  owner_id: string | null
  /** Last bank statement this wallet was reconciled with (signed-in only). */
  last_reconciled_on?: string | null
  last_reconciled_balance?: number | null
  /** Savings goal: target amount (null for an ordinary wallet). Goals only take transfers. */
  goal_target?: number | null
  /** Savings goal: target date (yyyy-MM-dd). */
  goal_date?: string | null
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
  /** Confirmed against a bank statement line (cleared when its money changes). */
  reconciled_at?: string | null
  /** The bank's transaction reference, when known. */
  bank_ref?: string | null
} & Attribution

/** Who recorded a row; the name is a snapshot taken when it was recorded. */
export type Attribution = {
  created_by: string | null
  created_by_name: string | null
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
} & Attribution &
  DebtInsurance

/** Optional loan insurance (e.g. credit life insurance the bank requires). */
export type DebtInsurance = {
  insured?: boolean
  insurer?: string | null
  insurance_policy_no?: string | null
  /** Yearly premium. */
  insurance_premium?: number | null
  insurance_currency?: Currency | null
  /** yyyy-MM-dd */
  insurance_renewal_date?: string | null
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

/** ACTIVITY: another family member recorded something. */
export type NotificationType = "DUE_DATE" | "SYSTEM" | "AI_ADVICE" | "ACTIVITY"
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
  /** Recipient; null = everyone in the workspace. */
  user_id: string | null
  /** The ledger row an ACTIVITY alert is about. */
  transaction_id: string | null
  actor_name: string | null
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
} & DebtInsurance

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
} & Attribution

/** តុងទីន: one hand (ក្បាល) the user plays in a rotating savings group. */
export type TontineFrequency = "WEEKLY" | "MONTHLY"

export type Tontine = {
  id: string
  workspace_id: string
  /** e.g. "ក្បាល ៥០ ដុល្លារ" */
  name: string
  /** មេតុងទីន */
  leader_name: string | null
  leader_phone: string | null
  currency: Currency
  /** Full share per round (what a dead member pays). */
  share_amount: number
  frequency: TontineFrequency
  total_rounds: number
  /** Date of round 1 (yyyy-MM-dd). */
  start_date: string
  /** Suggested wallet for payments. */
  wallet_id: string | null
  /** Set once the user wins the bid (ដេញបាន): they become a dead member (កូនងាប់). */
  won_round: number | null
  won_amount: number | null
  won_bid: number | null
  won_on: string | null
  won_transaction_id: string | null
  note: string | null
  closed_at: string | null
  created_by: string | null
  created_at: string
}

export type TontineInput = Pick<
  Tontine,
  "name" | "leader_name" | "leader_phone" | "currency" | "share_amount" | "frequency" | "total_rounds" | "start_date" | "wallet_id" | "note"
>

export type TontinePayment = {
  id: string
  tontine_id: string
  workspace_id: string
  round_no: number
  amount: number
  /** Live members: how much less than the share they paid (the winning bid of that round). */
  discount: number
  paid_on: string
  /** The expense row, when paid from a wallet; deleting it undoes the round. */
  transaction_id: string | null
  created_at: string
}

export type TontinePayInput = {
  tontine_id: string
  round_no: number
  /** In the tontine currency. */
  amount: number
  discount: number
  paid_on: string
  /** null: record the round without moving money. */
  wallet_id: string | null
  exchange_rate: number | null
  note: string | null
}

export type TontineCollectInput = {
  tontine_id: string
  round_no: number
  /** The pot received, in the tontine currency. */
  amount: number
  /** The bid the user offered (optional, for their records). */
  bid: number | null
  received_on: string
  wallet_id: string | null
  exchange_rate: number | null
  note: string | null
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
/** Only the fields being changed (the balance moves through the ledger). */
export type WalletUpdate = Partial<Omit<WalletInput, "balance">>

export type WalletInput = {
  name: string
  icon: string
  color: string | null
  visibility: WalletVisibility
  currency: Currency
  balance: number
  /** Savings goals only (see lib/goals.ts). */
  goal_target?: number | null
  goal_date?: string | null
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

export type Profile = {
  id: string
  display_name: string
  /** Storage path of the profile photo (bucket profile-images). */
  avatar_path?: string | null
  phone?: string | null
  bio?: string | null
}

export type WorkspaceMember = {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  joined_at: string
  display_name: string
}

export type WorkspaceInvite = {
  id: string
  workspace_id: string
  code: string
  role: Exclude<WorkspaceRole, "OWNER">
  created_at: string
  expires_at: string
  used_at: string | null
}

export type InviteLookup =
  | { status: "ok"; workspace_id: string; workspace_name: string; inviter_name?: string; role: WorkspaceRole }
  | { status: "already_member"; workspace_id: string; workspace_name: string }
  | { status: "invalid" | "expired" | "used" | "rate_limited" | "member_limit" }

/** Monthly spending cap for one expense category. */
export type Budget = {
  id: string
  workspace_id: string
  category_id: string
  amount: number
  currency: Currency
  created_at: string
  updated_at: string
}

export type BudgetInput = { category_id: string; amount: number; currency: Currency }

/** Thrown for features that need a signed-in account (e.g. real invitations). */
export class AccountRequiredError extends Error {
  constructor() {
    super("Sign in to use this feature")
    this.name = "AccountRequiredError"
  }
}

/** Thrown when the Free plan's limit is reached (the database refuses; the app offers an upgrade). */
export class PlanLimitError extends Error {
  constructor(readonly limit: "wallets" | "family") {
    super(`Plan limit: ${limit}`)
    this.name = "PlanLimitError"
  }
}

/** Thrown when someone else's personal wallet would be used. */
export class PersonalWalletError extends Error {
  constructor() {
    super("Only its owner can use this wallet")
    this.name = "PersonalWalletError"
  }
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
