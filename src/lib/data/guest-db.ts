import Dexie, { type EntityTable } from "dexie"

import type {
  AppNotification,
  Budget,
  Category,
  Debt,
  DebtRepayment,
  Transaction,
  Wallet,
  Workspace,
  WorkspaceMember,
} from "./types"

/** Everything financial in Guest Mode (what snapshots and backups contain). */
export type GuestData = {
  workspaces: Workspace[]
  wallets: Wallet[]
  categories: Category[]
  transactions: Transaction[]
  debts: Debt[]
  repayments: DebtRepayment[]
  notifications: AppNotification[]
  seededWorkspaceIds: string[]
  /** Added in Phase 7; absent in older snapshots and backups. */
  budgets?: Budget[]
  members?: WorkspaceMember[]
}

export type ReceiptRow = { id: string; blob: Blob; created_at: string }

export type SnapshotRow = {
  /** "daily:yyyy-MM-dd" (state at the start of that day = end of the previous one) or "undo:<iso>". */
  id: string
  kind: "daily" | "undo"
  /** Calendar day the data represents the end of (daily), or when it was taken (undo). */
  label_date: string
  created_at: string
  data: GuestData
}

/** Guest Mode IndexedDB: receipt photos and data snapshots (localStorage is too small for either). */
export const guestDb = new Dexie("luysmart-guest") as Dexie & {
  receipts: EntityTable<ReceiptRow, "id">
  snapshots: EntityTable<SnapshotRow, "id">
}
guestDb.version(1).stores({ receipts: "id" })
guestDb.version(2).stores({ receipts: "id", snapshots: "id, kind, created_at" })
