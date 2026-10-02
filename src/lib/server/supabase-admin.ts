import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role client for the few server-only database functions (KHQR
 * create/confirm/expire). Uses SUPABASE_SECRET_KEY, which is never exposed to
 * the browser: it has no NEXT_PUBLIC_ prefix and this module is imported only
 * by API routes.
 */
let client: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin is server-only")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY is not configured")
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
