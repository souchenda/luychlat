import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * One active device per account ("ចូលប្រើបានតែ ១ គ្រឿង"), like mobile banking:
 * a fresh sign-in signs every other device out. public.claim_single_session
 * removes the other sessions (their refresh tokens go with them, and the
 * database refuses their requests at once via public.session_alive); their
 * SessionGuard then sends them to the login page.
 *
 * Owner / super admins are exempt and may stay signed in on several devices,
 * so Supabase's own "sign out others" only runs once the database says
 * 'claimed'. Never throws: signing in has already succeeded.
 */
export async function claimSingleSession(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.rpc("claim_single_session")
    if (error || data !== "claimed") return
    await supabase.auth.signOut({ scope: "others" })
  } catch {
    // Network hiccup: the others still lose access when their tokens expire.
  }
}
