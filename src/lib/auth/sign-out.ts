import { getQueryClient } from "@/lib/query-client"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAiStore } from "@/stores/ai-store"
import { useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

/**
 * Ends the Supabase session and wipes device-level security settings and AI keys.
 * `local`: only this device — used when the account already signed in elsewhere
 * (a global sign-out from here would end the new device's session too).
 */
export async function signOutEverywhere(scope: "global" | "local" = "global") {
  await getSupabaseBrowserClient()?.auth.signOut({ scope })
  useSessionStore.getState().setUser(null)
  useLockStore.getState().clearSecurity()
  useAiStore.getState().clearKeys()
  getQueryClient().clear()
}
