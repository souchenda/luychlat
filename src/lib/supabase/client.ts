import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config"

let client: SupabaseClient | null = null

/** Browser Supabase client, or null when Supabase is not configured. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey)
  return client
}
