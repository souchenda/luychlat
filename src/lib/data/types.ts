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
}

export type WalletInput = {
  name: string
  icon: string
  color: string | null
  currency: Currency
  balance: number
}

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

/** Thrown when a transfer would overdraw the source wallet. */
export class InsufficientBalanceError extends Error {
  constructor() {
    super("Insufficient balance")
    this.name = "InsufficientBalanceError"
  }
}
