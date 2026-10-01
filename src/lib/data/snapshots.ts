import { format, subDays } from "date-fns"

import { useGuestDataStore } from "@/stores/guest-data-store"

import { guestDb, type GuestData, type SnapshotRow } from "./guest-db"

/**
 * Daily snapshots (Guest Mode). A web app can't run at midnight, so the
 * snapshot is taken the first time the app opens on a new day, before any
 * change: that state *is* the end of the previous day. "Rollback to
 * yesterday" restores it. Rollbacks first save an undo point.
 */
const KEEP_DAILY = 7
const KEEP_UNDO = 3

export function currentGuestData(): GuestData {
  const s = useGuestDataStore.getState()
  return {
    workspaces: s.workspaces,
    wallets: s.wallets,
    categories: s.categories,
    transactions: s.transactions,
    debts: s.debts,
    repayments: s.repayments,
    notifications: s.notifications,
    seededWorkspaceIds: s.seededWorkspaceIds,
  }
}

const hasData = (d: GuestData) => d.wallets.length > 0 || d.transactions.length > 0 || d.debts.length > 0

async function prune(kind: SnapshotRow["kind"], keep: number) {
  const rows = await guestDb.snapshots.where("kind").equals(kind).sortBy("created_at")
  const extra = rows.slice(0, Math.max(0, rows.length - keep))
  if (extra.length) await guestDb.snapshots.bulkDelete(extra.map((r) => r.id))
}

/** Saves today's start-of-day snapshot once per day. Returns true when one was taken. */
export async function ensureDailySnapshot(now = new Date()): Promise<boolean> {
  const today = format(now, "yyyy-MM-dd")
  const id = `daily:${today}`
  if (await guestDb.snapshots.get(id)) return false
  const data = currentGuestData()
  if (!hasData(data)) return false
  await guestDb.snapshots.put({
    id,
    kind: "daily",
    label_date: format(subDays(now, 1), "yyyy-MM-dd"),
    created_at: now.toISOString(),
    data: structuredClone(data),
  })
  await prune("daily", KEEP_DAILY)
  return true
}

/** Newest first. */
export async function listSnapshots(): Promise<SnapshotRow[]> {
  const rows = await guestDb.snapshots.orderBy("created_at").reverse().toArray()
  return rows
}

/** Replaces the guest data with `data` (receipts are kept). */
export function applyGuestData(data: GuestData) {
  useGuestDataStore.setState(structuredClone(data))
}

/** Restores a snapshot after saving the current state as an undo point. */
export async function restoreSnapshot(id: string): Promise<void> {
  const snapshot = await guestDb.snapshots.get(id)
  if (!snapshot) throw new Error("Snapshot not found")
  const now = new Date()
  await guestDb.snapshots.put({
    id: `undo:${now.toISOString()}`,
    kind: "undo",
    label_date: format(now, "yyyy-MM-dd"),
    created_at: now.toISOString(),
    data: structuredClone(currentGuestData()),
  })
  await prune("undo", KEEP_UNDO)
  applyGuestData(snapshot.data)
}

export function summarize(data: GuestData) {
  return { wallets: data.wallets.length, transactions: data.transactions.length, debts: data.debts.length }
}
