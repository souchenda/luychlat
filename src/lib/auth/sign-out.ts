import { guestReceipts } from "@/lib/data/guest-receipts"
import { getQueryClient } from "@/lib/query-client"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAiStore } from "@/stores/ai-store"
import { useGuestDataStore } from "@/stores/guest-data-store"
import { useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

/**
 * Ends the Supabase session or Guest Mode and wipes device-level security
 * settings and AI keys. Ending Guest Mode also deletes the guest data on this device.
 */
export async function signOutEverywhere() {
  if (useSessionStore.getState().isGuest) {
    useGuestDataStore.getState().clear()
    await guestReceipts.clear()
  }
  await getSupabaseBrowserClient()?.auth.signOut()
  useSessionStore.getState().endGuest()
  useSessionStore.getState().setUser(null)
  useLockStore.getState().clearSecurity()
  useAiStore.getState().clearKeys()
  getQueryClient().clear()
}
