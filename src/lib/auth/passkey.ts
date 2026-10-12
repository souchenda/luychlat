"use client"

import { startAuthentication, startRegistration } from "@simplewebauthn/browser"

/**
 * Passkeys in the browser (the server half: /api/auth/passkey). Shown only where the device has a
 * built-in Face ID / Touch ID / fingerprint authenticator — elsewhere (old browsers, the Android
 * app's WebView) the password and PIN stay as they are.
 */
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
    if (done.status === 409) return "duplicate"
    return done.ok ? "ok" : "failed"
  } catch (e) {
    if (e instanceof Error && e.name === "InvalidStateError") return "duplicate" // this device already has one
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
    if (done.status === 404) return "unknown"
    return done.ok ? "ok" : "failed"
  } catch (e) {
    return cancelled(e) ? "cancelled" : "failed"
  }
}
