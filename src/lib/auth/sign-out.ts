import { getQueryClient } from "@/lib/query-client"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAiStore } from "@/stores/ai-store"
import { useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

/** Ends the Supabase session and wipes device-level security settings and AI keys. */
export async function signOutEverywhere() {
  await getSupabaseBrowserClient()?.auth.signOut()
  useSessionStore.getState().setUser(null)
  useLockStore.getState().clearSecurity()
  useAiStore.getState().clearKeys()
  getQueryClient().clear()
}
