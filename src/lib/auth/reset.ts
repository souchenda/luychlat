import { guestReceipts } from "@/lib/data/guest-receipts"
import { getQueryClient } from "@/lib/query-client"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

const STORAGE_PREFIX = "luysmart-"
const RECEIPT_BUCKET = "receipts"

/**
 * Danger Zone: irreversibly wipes everything and returns the app to its
 * first-launch state.
 * - Cloud (signed in): reset_my_data() deletes the user's financial data and
 *   receipt files; the account itself is kept.
 * - This device: guest data, receipts (IndexedDB), PIN / biometrics, AI keys,
 *   preferences, offline caches; then signs out.
 */
export async function resetAllData() {
  const supabase = getSupabaseBrowserClient()
  const user = useSessionStore.getState().user

  if (supabase && user) {
    const files = await supabase.storage.from(RECEIPT_BUCKET).list(user.id, { limit: 1000 })
    const paths = (files.data ?? []).map((f) => `${user.id}/${f.name}`)
    if (paths.length) await supabase.storage.from(RECEIPT_BUCKET).remove(paths)
    const { error } = await supabase.rpc("reset_my_data")
    if (error) throw error
    await supabase.auth.signOut()
  }

  await guestReceipts.clear()
  getQueryClient().clear()
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key)
  }
  sessionStorage.clear()
  if ("caches" in window) {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith(STORAGE_PREFIX)).map((k) => caches.delete(k)))
  }
}
