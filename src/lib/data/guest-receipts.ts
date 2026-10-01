import { guestDb } from "./guest-db"

/** Guest Mode receipt images (IndexedDB: localStorage is too small for photos). */
const PREFIX = "local:"

export const guestReceipts = {
  async put(blob: Blob, id: string = crypto.randomUUID()): Promise<string> {
    await guestDb.receipts.put({ id, blob, created_at: new Date().toISOString() })
    return `${PREFIX}${id}`
  },
  async url(ref: string): Promise<string | null> {
    if (!ref.startsWith(PREFIX)) return null
    const row = await guestDb.receipts.get(ref.slice(PREFIX.length))
    return row ? URL.createObjectURL(row.blob) : null
  },
  async get(ref: string): Promise<Blob | null> {
    if (!ref.startsWith(PREFIX)) return null
    return (await guestDb.receipts.get(ref.slice(PREFIX.length)))?.blob ?? null
  },
  async remove(ref: string): Promise<void> {
    if (ref.startsWith(PREFIX)) await guestDb.receipts.delete(ref.slice(PREFIX.length))
  },
  /** Wipes receipts and snapshots (sign-out / factory reset). */
  async clear(): Promise<void> {
    await Promise.all([guestDb.receipts.clear(), guestDb.snapshots.clear()])
  },
}

export const receiptIdOf = (ref: string) => (ref.startsWith(PREFIX) ? ref.slice(PREFIX.length) : null)
