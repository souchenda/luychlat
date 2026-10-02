/**
 * Quick biometric unlock (FaceID / fingerprint / Windows Hello) through a WebAuthn
 * platform credential with user verification. This is the guideline's Phase 1
 * "Biometric Mock": no server verifies the assertion; it only gates the local
 * App Lock on top of the PIN. NEXT_PUBLIC_BIOMETRIC_MOCK=true always simulates a
 * successful scan instead of calling WebAuthn (for development and testing).
 */
export const BIOMETRIC_MOCK = process.env.NEXT_PUBLIC_BIOMETRIC_MOCK === "true"
const MOCK_CREDENTIAL_ID = "mock-credential"

function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Which scan the device will most likely ask for. WebAuthn never says (the
 * operating system picks face or fingerprint itself), so this is only for the
 * icon and wording: iPhones without a home button use Face ID, iPhone SE/8
 * and Macs use Touch ID; Android, Windows Hello and iPads may use either.
 */
export type BiometricKind = "face" | "fingerprint" | "any"
export type BiometricPreference = "auto" | "face" | "fingerprint"

export function detectBiometricKind(): BiometricKind {
  if (typeof navigator === "undefined") return "any"
  const ua = navigator.userAgent
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (/iPhone/.test(ua)) {
    // Home-button iPhones (SE, 6–8 incl. Plus) are at most 736pt tall.
    return Math.max(screen.width, screen.height) >= 812 ? "face" : "fingerprint"
  }
  if (/Macintosh/.test(ua) && !iPad) return "fingerprint"
  return "any"
}

export function biometricKind(preference: BiometricPreference): BiometricKind {
  return preference === "auto" ? detectBiometricKind() : preference
}

/**
 * ok: verified. cancelled: the user closed the prompt, it timed out, or the
 * browser refused to show it without a tap (iOS) — not a failed scan.
 * failed: the scan didn't match, or the credential is gone.
 */
export type BiometricResult = "ok" | "cancelled" | "failed"

export async function isPlatformBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  return BIOMETRIC_MOCK || (await isPlatformBiometricAvailable())
}

/** Creates a device-bound credential; returns its id, or null if cancelled or unsupported. */
export async function registerBiometric(): Promise<string | null> {
  if (BIOMETRIC_MOCK) {
    await wait(400)
    return MOCK_CREDENTIAL_ID
  }
  if (!(await isPlatformBiometricAvailable())) return null
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "LuySmart", id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: "luysmart-app-lock",
          displayName: "LuySmart App Lock",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        // Built-in Face ID / Touch ID / fingerprint / Windows Hello; the device picks the scan.
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "discouraged",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null
    return credential ? toBase64Url(credential.rawId) : null
  } catch {
    return null
  }
}

/** The scan in progress; a new tap cancels it and starts again. */
let pendingScan: AbortController | null = null
const SCAN_TIMEOUT_MS = 60_000

/** Shows the device's own Face ID / fingerprint prompt for the saved credential. */
export async function verifyBiometric(credentialId: string): Promise<BiometricResult> {
  if (credentialId === MOCK_CREDENTIAL_ID) {
    await wait(400)
    return BIOMETRIC_MOCK ? "ok" : "failed"
  }
  pendingScan?.abort()
  const controller = new AbortController()
  pendingScan = controller
  // Some browsers ignore the WebAuthn timeout; never leave the lock screen waiting.
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
  try {
    const assertion = await navigator.credentials.get({
      signal: controller.signal,
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    })
    return assertion ? "ok" : "cancelled"
  } catch (error) {
    // NotAllowedError: cancelled, timed out, too many tries, or no user tap.
    const name = error instanceof DOMException ? error.name : ""
    return name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed"
  } finally {
    clearTimeout(timer)
    if (pendingScan === controller) pendingScan = null
  }
}
