import { format } from "date-fns"

import type { GuestData } from "./guest-db"
import type { DataRepo } from "./repo"

/**
 * Manual backup file (.json): a full dump of the account's data, readable
 * through the repo (everything is already safe in the cloud; this is a copy
 * the user keeps). Receipt photos stay in the account and are not included.
 */
const BACKUP_FORMAT = "luysmart-backup"
const BACKUP_VERSION = 1

export type BackupFile = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  data: GuestData
  receipts: Record<string, string>
}

export async function buildBackup(repo: DataRepo): Promise<BackupFile> {
  const workspaces = await repo.listWorkspaces()
  const data: GuestData = {
    workspaces,
    wallets: [],
    categories: [],
    transactions: [],
    debts: [],
    repayments: [],
    notifications: [],
    budgets: [],
    members: [],
    tontines: [],
    tontinePayments: [],
    seededWorkspaceIds: workspaces.map((w) => w.id),
  }
  for (const w of workspaces) {
    data.wallets.push(...(await repo.listWallets(w.id)))
    data.categories.push(...(await repo.listCategories(w.id)))
    data.transactions.push(...(await repo.listTransactions(w.id)))
    const debts = await repo.listDebts(w.id)
    data.debts.push(...debts)
    for (const d of debts) data.repayments.push(...(await repo.listRepayments(d.id)))
    data.notifications.push(...(await repo.listNotifications(w.id)))
    data.budgets!.push(...(await repo.listBudgets(w.id)))
    data.members!.push(...(await repo.listMembers(w.id)))
    data.tontines!.push(...(await repo.listTontines(w.id)))
    data.tontinePayments!.push(...(await repo.listTontinePayments(w.id)))
  }
  // Receipt paths only work inside this account; leave them out of the file.
  data.transactions = data.transactions.map((t) => ({ ...t, receipt_url: null }))
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data, receipts: {} }
}

export function downloadBackup(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `luysmart-backup-${format(new Date(), "yyyyMMdd-HHmm")}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
