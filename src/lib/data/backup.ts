import { format } from "date-fns"
import { z } from "zod"

import type { DataRepo } from "./repo"
import { guestDb, type GuestData } from "./guest-db"
import { guestReceipts, receiptIdOf } from "./guest-receipts"
import { applyGuestData, currentGuestData } from "./snapshots"

/**
 * Manual backup file (.json). Export works in both modes (cloud: a full data
 * dump without receipt photos). Restore replaces the Guest Mode data on this
 * device, after validating the file and saving an undo snapshot.
 */
const BACKUP_FORMAT = "luysmart-backup"
const BACKUP_VERSION = 1
const MAX_RECEIPT_CHARS = 8_000_000 // ~6 MB per photo as a data URL

const id = z.string().min(1).max(64)
const iso = z.string().min(10).max(40)
const money = z.number().finite()
const currency = z.enum(["USD", "KHR"])
const text = (max: number) => z.string().max(max).nullable()
// Fields added in Phase 7 are optional so older backups still restore.
const attribution = { created_by: id.nullable().optional(), created_by_name: text(40).optional() }
const role = z.enum(["OWNER", "MEMBER", "VIEWER"])

const schema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: iso,
  data: z.object({
    workspaces: z.array(
      z.object({
        id,
        name: z.string().max(60),
        type: z.enum(["PERSONAL", "BUSINESS", "FAMILY"]),
        currency_default: currency,
        created_at: iso,
        user_id: z.string().max(64).optional(),
        role: role.optional(),
        member_count: z.number().int().min(1).optional(),
      }),
    ),
    wallets: z.array(
      z.object({
        id,
        workspace_id: id,
        name: z.string().max(60),
        balance: money,
        currency,
        icon: text(40),
        color: text(7),
        sort_order: z.number().int(),
        archived_at: iso.nullable(),
        created_at: iso,
        visibility: z.enum(["SHARED", "PERSONAL"]).optional(),
        owner_id: id.nullable().optional(),
      }),
    ),
    categories: z.array(
      z.object({
        id,
        workspace_id: id,
        name: z.string().max(60),
        type: z.enum(["INCOME", "EXPENSE"]),
        icon: text(40),
        color: text(7),
        preset_key: text(40),
        created_at: iso,
      }),
    ),
    transactions: z.array(
      z.object({
        id,
        workspace_id: id,
        wallet_id: id,
        to_wallet_id: id.nullable(),
        category_id: id.nullable(),
        amount: money,
        to_amount: money.nullable(),
        currency,
        type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
        exchange_rate: money.nullable(),
        note: text(500),
        receipt_url: text(200),
        transaction_date: iso,
        created_at: iso,
        debt_id: id.nullable(),
        ...attribution,
      }),
    ),
    debts: z.array(
      z.object({
        id,
        workspace_id: id,
        type: z.enum(["PAYABLE", "RECEIVABLE"]),
        party_name: z.string().max(100),
        contact_phone: text(20),
        total_amount: money,
        paid_amount: money,
        currency,
        interest_rate: money,
        interest_period: z.enum(["YEAR", "MONTH"]),
        start_date: z.string().max(10),
        due_date: z.string().max(10).nullable(),
        status: z.enum(["ACTIVE", "PARTIALLY_PAID", "SETTLED", "OVERDUE"]),
        note: text(500),
        created_at: iso,
        disbursement_transaction_id: id.nullable(),
        ...attribution,
      }),
    ),
    repayments: z.array(
      z.object({
        id,
        debt_id: id,
        wallet_id: id,
        amount_paid: money,
        payment_date: iso,
        note: text(500),
        transaction_id: id,
        created_at: iso,
        ...attribution,
      }),
    ),
    notifications: z.array(
      z.object({
        id,
        workspace_id: id,
        debt_id: id.nullable(),
        title: z.string().max(300),
        message: z.string().max(2000),
        type: z.enum(["DUE_DATE", "SYSTEM", "AI_ADVICE", "ACTIVITY"]),
        is_read: z.boolean(),
        scheduled_at: iso,
        alert_key: z.enum(["D7", "D3", "D0", "OVERDUE"]).nullable(),
        user_id: id.nullable().optional(),
        transaction_id: id.nullable().optional(),
        actor_name: text(40).optional(),
      }),
    ),
    budgets: z
      .array(
        z.object({ id, workspace_id: id, category_id: id, amount: money, currency, created_at: iso, updated_at: iso }),
      )
      .optional(),
    members: z
      .array(
        z.object({
          id,
          workspace_id: id,
          user_id: z.string().max(64),
          role,
          joined_at: iso,
          display_name: z.string().max(40),
        }),
      )
      .optional(),
    seededWorkspaceIds: z.array(id),
  }),
  receipts: z.record(id, z.string().max(MAX_RECEIPT_CHARS).regex(/^data:image\/(jpeg|png|webp);base64,/)).default({}),
})

export type BackupFile = z.infer<typeof schema>

/** References must point inside the file (no dangling wallets, debts, workspaces). */
function checkIntegrity(data: GuestData) {
  const ws = new Set(data.workspaces.map((w) => w.id))
  const wallets = new Set(data.wallets.map((w) => w.id))
  const debts = new Set(data.debts.map((d) => d.id))
  const txs = new Set(data.transactions.map((t) => t.id))
  const categories = new Set(data.categories.map((c) => c.id))
  const ok =
    data.wallets.every((w) => ws.has(w.workspace_id)) &&
    data.categories.every((c) => ws.has(c.workspace_id)) &&
    data.transactions.every(
      (t) => ws.has(t.workspace_id) && wallets.has(t.wallet_id) && (!t.to_wallet_id || wallets.has(t.to_wallet_id)),
    ) &&
    data.debts.every((d) => ws.has(d.workspace_id)) &&
    data.repayments.every((r) => debts.has(r.debt_id) && txs.has(r.transaction_id) && wallets.has(r.wallet_id)) &&
    (data.budgets ?? []).every((b) => ws.has(b.workspace_id) && categories.has(b.category_id)) &&
    (data.members ?? []).every((m) => ws.has(m.workspace_id))
  if (!ok) throw new Error("integrity")
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Guest: the local data + receipt photos. Cloud: everything readable through the repo (no photos). */
export async function buildBackup(repo: DataRepo, mode: "guest" | "cloud"): Promise<BackupFile> {
  let data: GuestData
  const receipts: Record<string, string> = {}

  if (mode === "guest") {
    data = currentGuestData()
    for (const tx of data.transactions) {
      const rid = tx.receipt_url ? receiptIdOf(tx.receipt_url) : null
      const blob = tx.receipt_url && rid ? await guestReceipts.get(tx.receipt_url) : null
      if (rid && blob) receipts[rid] = await blobToDataUrl(blob)
    }
  } else {
    const workspaces = await repo.listWorkspaces()
    data = {
      workspaces,
      wallets: [],
      categories: [],
      transactions: [],
      debts: [],
      repayments: [],
      notifications: [],
      budgets: [],
      members: [],
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
    }
    // Cloud receipt paths only work in that account; drop them from the file.
    data.transactions = data.transactions.map((t) => ({ ...t, receipt_url: null }))
  }

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data, receipts }
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

/** Parses and validates a backup file; throws Error("invalid" | "integrity"). */
export async function readBackupFile(file: File): Promise<BackupFile> {
  if (file.size > 200 * 1024 * 1024) throw new Error("invalid")
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    throw new Error("invalid")
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw new Error("invalid")
  checkIntegrity(parsed.data.data as GuestData)
  return parsed.data
}

/** Guest Mode restore: saves an undo snapshot, then replaces data and adds the receipt photos. */
export async function restoreBackup(backup: BackupFile) {
  const now = new Date()
  await guestDb.snapshots.put({
    id: `undo:${now.toISOString()}`,
    kind: "undo",
    label_date: format(now, "yyyy-MM-dd"),
    created_at: now.toISOString(),
    data: structuredClone(currentGuestData()),
  })
  for (const [rid, dataUrl] of Object.entries(backup.receipts)) {
    const blob = await (await fetch(dataUrl)).blob()
    await guestReceipts.put(blob, rid)
  }
  applyGuestData(backup.data as GuestData)
}

export function backupSummary(backup: BackupFile) {
  const d = backup.data
  return {
    exportedAt: backup.exportedAt,
    wallets: d.wallets.length,
    transactions: d.transactions.length,
    debts: d.debts.length,
    receipts: Object.keys(backup.receipts).length,
  }
}
