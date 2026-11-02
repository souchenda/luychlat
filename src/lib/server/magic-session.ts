// Server only: a session for an account the server has already proven (Telegram's signature, or the bot's one-tap link).
// A one-time magic-link token for the address (no email is sent), redeemed here at once and set as cookies; then the
// one-device rule applies as for any sign-in. Needs SUPABASE_SERVICE_ROLE_KEY (server only, never NEXT_PUBLIC_).
import { claimSingleSession } from "@/lib/auth/single-session"
import { logEvent } from "@/lib/server/events"
import { supabaseUrl } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null

/** True when the session was made (cookies set); the reason is logged under `what`. */
export async function startSession(email: string, what: string): Promise<boolean> {
  const key = serviceKey()
  if (!key || !supabaseUrl) return false
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ type: "magiclink", email }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  const body = (await link?.json().catch(() => null)) as { hashed_token?: string; properties?: { hashed_token?: string } } | null
  const tokenHash = body?.properties?.hashed_token ?? body?.hashed_token
  if (!link?.ok || !tokenHash) {
    logEvent("error", "auth", `${what}: generate_link failed (HTTP ${link?.status ?? "network"})`, { fold: true })
    return false
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
  if (error) {
    logEvent("error", "auth", `${what}: verify failed (${error.message.slice(0, 80)})`, { fold: true })
    return false
  }
  await claimSingleSession(supabase)
  return true
}

/**
 * A phone account for a number Telegram verified (the bot's sign-up): confirmed at once, a random password nobody knows
 * (the person signs in by the bot's link, and may set a password later in Settings › Security), their Telegram name.
 * «exists» when the address was taken meanwhile (a double tap) — the caller simply looks it up again.
 */
export async function createPhoneAccount(email: string, name: string): Promise<"created" | "exists" | "failed"> {
  const key = serviceKey()
  if (!key || !supabaseUrl) return "failed"
  const password = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { ...(name ? { full_name: name } : {}), signup: "telegram" } }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (res?.ok) return "created"
  const err = (await res?.json().catch(() => null)) as { error_code?: string; code?: string; msg?: string } | null
  if (res?.status === 422 && /exists|registered/i.test(`${err?.error_code ?? ""} ${err?.code ?? ""} ${err?.msg ?? ""}`)) return "exists"
  logEvent("error", "auth", `Telegram sign-up: create user failed (HTTP ${res?.status ?? "network"} ${err?.error_code ?? ""})`, { fold: true })
  return "failed"
}
