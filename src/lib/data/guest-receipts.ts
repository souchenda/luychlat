import Dexie, { type EntityTable } from "dexie"

/** Guest Mode receipt images (IndexedDB: localStorage is too small for photos). */
type ReceiptRow = { id: string; blob: Blob; created_at: string }

const db = new Dexie("luysmart-guest") as Dexie & { receipts: EntityTable<ReceiptRow, "id"> }
db.version(1).stores({ receipts: "id" })

const PREFIX = "local:"

export const guestReceipts = {
  async put(blob: Blob): Promise<string> {
    const id = crypto.randomUUID()
    await db.receipts.put({ id, blob, created_at: new Date().toISOString() })
    return `${PREFIX}${id}`
  },
  async url(ref: string): Promise<string | null> {
    if (!ref.startsWith(PREFIX)) return null
    const row = await db.receipts.get(ref.slice(PREFIX.length))
    return row ? URL.createObjectURL(row.blob) : null
  },
  async remove(ref: string): Promise<void> {
    if (ref.startsWith(PREFIX)) await db.receipts.delete(ref.slice(PREFIX.length))
  },
  async clear(): Promise<void> {
    await db.receipts.clear()
  },
}
