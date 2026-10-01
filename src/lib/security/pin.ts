/**
 * Client-side PIN hashing (PBKDF2-SHA256 via WebCrypto). The PIN only gates the
 * local App Lock; it never leaves the device and is not an auth credential.
 */
const ITERATIONS = 210_000

const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "1212", "0123", "9876",
])

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin)
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256)
  return toBase64(new Uint8Array(bits))
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { hash: await derive(pin, salt), salt: toBase64(salt) }
}

export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const candidate = await derive(pin, fromBase64(salt))
  if (candidate.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}
