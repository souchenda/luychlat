"use client"

import { startAuthentication, startRegistration } from "@simplewebauthn/browser"

/**
 * Passkeys in the browser (the server half: /api/auth/passkey). Offered only where the device has a
 * built-in Face ID / Touch ID / fingerprint authenticator — elsewhere (old browsers, the Android
 * app's WebView) the password and PIN stay as they are.
 *
 * This device made a passkey (Settings › Security) — the login button shows only then, so nobody meets
 * the phone's «no passkeys available» sheet. Keeps the credential ids made here (the list can tell
 * which one is this device's when one is removed).
 */
export const PASSKEY_FLAG = "luychlat_has_passkey"

function readIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PASSKEY_FLAG) ?? "[]")
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}
function writeIds(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(PASSKEY_FLAG, JSON.stringify([...new Set(ids)]))
    else localStorage.removeItem(PASSKEY_FLAG)
  } catch {
    // private mode: the button just stays hidden
  }
}
export const hasLocalPasskey = () => readIds().length > 0
export const rememberPasskey = (credentialId: string) => writeIds([...readIds(), credentialId])
export const forgetPasskey = (credentialId?: string) => writeIds(credentialId ? readIds().filter((id) => id !== credentialId) : [])

export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false
  try {
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false
    const status = await fetch("/api/auth/passkey", { cache: "no-store" }).then((r) => r.json() as Promise<{ enabled?: boolean }>)
    return Boolean(status.enabled)
  } catch {
    return false
  }
}

export type PasskeyOutcome = "ok" | "cancelled" | "unknown" | "failed"

async function step<T>(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch("/api/auth/passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T }
}

/** The phone's own prompt was closed or timed out — not a failure to report. */
const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError")

/** Adds this device's Face ID / fingerprint as a passkey for the signed-in account. */
export async function registerPasskey(label: string): Promise<PasskeyOutcome | "duplicate"> {
  try {
    const opts = await step<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"]; challengeId: string }>({ step: "register-options" })
    if (!opts.ok) return "failed"
    const response = await startRegistration({ optionsJSON: opts.data.options })
    const done = await step<{ ok?: boolean; error?: string }>({ step: "register-verify", challengeId: opts.data.challengeId, response, label })
    if (done.status === 409) {
      rememberPasskey(response.id)
      return "duplicate"
    }
    if (done.ok) rememberPasskey(response.id)
    return done.ok ? "ok" : "failed"
  } catch (e) {
    // This device already has one (made before the flag existed): its login button shows from now on.
    if (e instanceof Error && e.name === "InvalidStateError") {
      rememberPasskey("this-device")
      return "duplicate"
    }
    return cancelled(e) ? "cancelled" : "failed"
  }
}

/** Signs in with a passkey: the phone offers this site's passkeys, one Face ID / fingerprint, done. */
export async function signInWithPasskey(): Promise<PasskeyOutcome> {
  try {
    const opts = await step<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeId: string }>({ step: "login-options" })
    if (!opts.ok) return "failed"
    const response = await startAuthentication({ optionsJSON: opts.data.options })
    const done = await step<{ ok?: boolean; error?: string }>({ step: "login-verify", challengeId: opts.data.challengeId, response })
    if (done.status === 404) {
      // Removed on the server: this device's button goes.
      forgetPasskey()
      return "unknown"
    }
    if (done.ok) rememberPasskey(response.id)
    return done.ok ? "ok" : "failed"
  } catch (e) {
    return cancelled(e) ? "cancelled" : "failed"
  }
}
