// Server only: passkey (W3C WebAuthn) registration and sign-in, verified with @simplewebauthn/server.
// The service-role key is the only writer of public.passkeys / passkey_challenges (server only, never
// NEXT_PUBLIC_). A sign-in makes the session the same way as «ចូលរហ័សជាមួយ Telegram»: a one-time
// magic-link token for the account, redeemed here at once (no email sent), then the one-device rule.
import { createClient } from "@supabase/supabase-js"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server"

import { claimSingleSession } from "@/lib/auth/single-session"
import { PASSKEY_RP_NAME } from "@/lib/passkey-rp"
import { logEvent } from "@/lib/server/events"
import { supabaseUrl } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
export const passkeysEnabled = () => Boolean(serviceKey() && supabaseUrl)
const service = () => createClient(supabaseUrl, serviceKey()!, { auth: { persistSession: false, autoRefreshToken: false } })

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url")
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"))

async function saveChallenge(kind: "register" | "login", challenge: string, userId: string | null) {
  const db = service()
  await db.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString())
  const { data, error } = await db.from("passkey_challenges").insert({ kind, challenge, user_id: userId }).select("id").single()
  if (error || !data) throw new Error(`challenge not saved: ${error?.message ?? "no row"}`)
  return data.id as string
}

/** Single use: the challenge is deleted as it is read; null when unknown, expired or of another kind / user. */
async function takeChallenge(id: string, kind: "register" | "login", userId: string | null): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const { data } = await service().from("passkey_challenges").delete().eq("id", id).select("kind, challenge, user_id, expires_at").maybeSingle()
  if (!data || data.kind !== kind || Date.parse(data.expires_at) < Date.now()) return null
  if (kind === "register" && data.user_id !== userId) return null
  return data.challenge as string
}

/** The signed-in user (from the request's session cookies), or null. */
async function currentUser() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

export async function registrationOptions(rp: { rpID: string }) {
  const user = await currentUser()
  if (!user) return { error: "signed_out" as const }
  const { data: existing } = await service().from("passkeys").select("credential_id, transports").eq("user_id", user.id)
  const options = await generateRegistrationOptions({
    rpName: PASSKEY_RP_NAME,
    rpID: rp.rpID,
    userName: user.email ?? user.phone ?? user.id,
    userDisplayName: (user.user_metadata?.display_name as string | undefined) ?? "App Luy Chlat",
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id as string, transports: (c.transports as string[] | null) ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
  })
  const challengeId = await saveChallenge("register", options.challenge, user.id)
  return { options, challengeId }
}

export async function registrationVerify(rp: { origin: string; rpID: string }, body: { challengeId?: string; response?: RegistrationResponseJSON; label?: string }) {
  const user = await currentUser()
  if (!user) return { error: "signed_out" as const }
  const expected = body.challengeId ? await takeChallenge(body.challengeId, "register", user.id) : null
  if (!expected || !body.response) return { error: "expired" as const }
  const result = await verifyRegistrationResponse({ response: body.response, expectedChallenge: expected, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true }).catch((e: Error) => {
    logEvent("warn", "passkeys", `Registration rejected: ${e.message.slice(0, 120)}`, { fold: true })
    return null
  })
  if (!result?.verified) return { error: "invalid" as const }
  const c = result.registrationInfo.credential
  const { error } = await service()
    .from("passkeys")
    .insert({ user_id: user.id, credential_id: c.id, public_key: b64url(c.publicKey), counter: c.counter, transports: c.transports ?? null, device_label: body.label?.slice(0, 60) ?? null })
  if (error) {
    logEvent("error", "passkeys", `Passkey not saved: ${error.message}`, { fold: true })
    return { error: /duplicate/.test(error.message) ? ("duplicate" as const) : ("busy" as const) }
  }
  logEvent("info", "passkeys", "Passkey added", { fold: true })
  return { ok: true as const }
}

export async function authenticationOptions(rp: { rpID: string }) {
  // Discoverable credentials: the phone offers this site's passkeys itself — no email typed first.
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" })
  const challengeId = await saveChallenge("login", options.challenge, null)
  return { options, challengeId }
}

export async function authenticationVerify(rp: { origin: string; rpID: string }, body: { challengeId?: string; response?: AuthenticationResponseJSON }) {
  const expected = body.challengeId ? await takeChallenge(body.challengeId, "login", null) : null
  if (!expected || !body.response?.id) return { error: "expired" as const }
  const db = service()
  const { data: key } = await db.from("passkeys").select("id, user_id, credential_id, public_key, counter, transports").eq("credential_id", body.response.id).maybeSingle()
  if (!key) return { error: "unknown" as const }
  const result = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge: expected,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: true,
    credential: { id: key.credential_id as string, publicKey: fromB64url(key.public_key as string), counter: Number(key.counter), transports: (key.transports as string[] | null) ?? undefined },
  }).catch((e: Error) => {
    logEvent("warn", "passkeys", `Sign-in rejected: ${e.message.slice(0, 120)}`, { fold: true })
    return null
  })
  if (!result?.verified) return { error: "invalid" as const }
  await db.from("passkeys").update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", key.id)

  // The account's sign-in email (phone accounts have their own internal address), then the session.
  const { data: account } = await db.auth.admin.getUserById(key.user_id as string)
  const email = account.user?.email
  if (!email || account.user?.banned_until) return { error: "unavailable" as const }
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceKey()!, Authorization: `Bearer ${serviceKey()}` },
    body: JSON.stringify({ type: "magiclink", email }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  const linkBody = (await link?.json().catch(() => null)) as { hashed_token?: string; properties?: { hashed_token?: string } } | null
  const tokenHash = linkBody?.properties?.hashed_token ?? linkBody?.hashed_token
  if (!link?.ok || !tokenHash) {
    logEvent("error", "passkeys", `Passkey sign-in: generate_link failed (HTTP ${link?.status ?? "network"})`, { fold: true })
    return { error: "busy" as const }
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
  if (error) {
    logEvent("error", "passkeys", `Passkey sign-in: verify failed (${error.message.slice(0, 80)})`, { fold: true })
    return { error: "busy" as const }
  }
  await claimSingleSession(supabase)
  logEvent("info", "passkeys", "Signed in with a passkey", { fold: true })
  return { ok: true as const }
}
