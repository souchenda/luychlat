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

/** Prompts for FaceID / fingerprint; true when the user verified. */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  if (credentialId === MOCK_CREDENTIAL_ID) {
    await wait(400)
    return BIOMETRIC_MOCK
  }
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    })
    return assertion !== null
  } catch {
    return false
  }
}
