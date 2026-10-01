import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

/** Ends the Supabase session or Guest Mode and wipes device-level security settings. */
export async function signOutEverywhere() {
  await getSupabaseBrowserClient()?.auth.signOut()
  useSessionStore.getState().endGuest()
  useSessionStore.getState().setUser(null)
  useLockStore.getState().clearSecurity()
}
