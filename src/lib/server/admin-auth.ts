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

type StaffRole = "support" | "admin" | "super_admin"

/**
 * The caller when they are staff (admin_system_status accepts any staff role
 * with a 2FA-complete session), with their role. `minRole: "admin"` refuses support.
 */
export async function isAdminCaller(
  request: Request,
  opts: { minRole?: "support" | "admin" } = {},
): Promise<{ db: SupabaseClient; status: Record<string, unknown>; role: StaffRole } | null> {
  const db = callerDb(request)
  if (!db) return null
  const [{ data, error }, { data: role }] = await Promise.all([db.rpc("admin_system_status"), db.rpc("staff_role")])
  if (error || !data || !role) return null
  if (opts.minRole === "admin" && role === "support") return null
  return { db, status: data as Record<string, unknown>, role: role as StaffRole }
}
