// Server only: a database client acting as the signed-in caller, for admin API routes.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

/**
 * The caller's own client (their Bearer token), or null without one. Admin
 * checks stay in the database: the admin_* functions verify is_admin() and a
 * live, 2FA-complete session themselves.
 */
export function callerDb(request: Request): SupabaseClient | null {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  })
}

/** True when the caller is an admin (checked by admin_system_status in the database). */
export async function isAdminCaller(request: Request): Promise<{ db: SupabaseClient; status: Record<string, unknown> } | null> {
  const db = callerDb(request)
  if (!db) return null
  const { data, error } = await db.rpc("admin_system_status")
  return error || !data ? null : { db, status: data as Record<string, unknown> }
}
