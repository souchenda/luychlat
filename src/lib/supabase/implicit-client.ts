"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config"
import { cleanFetch } from "@/lib/supabase/clean-fetch"

let client: SupabaseClient | null = null

/**
 * Only to ASK for a password-reset e-mail whose link works in any browser (lib/auth/recovery-link.ts). It keeps no
 * session and never reads the URL — signing in stays with getSupabaseBrowserClient().
 */
export function getImplicitClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: cleanFetch },
  })
  return client
}
