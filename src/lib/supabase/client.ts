import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config"
import { cleanFetch } from "@/lib/supabase/clean-fetch"

let client: SupabaseClient | null = null

/** Browser Supabase client, or null when Supabase is not configured. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey, { global: { fetch: cleanFetch } })
  return client
}
