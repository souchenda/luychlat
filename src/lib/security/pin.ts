/**
 * Client-side PIN hashing (PBKDF2-SHA256 via WebCrypto). The PIN only gates the
 * local App Lock; it never leaves the device and is not an auth credential.
 */
const ITERATIONS = 210_000

/** New PINs have 6 digits, like Cambodian banking apps. Older 4-digit PINs still unlock once, then must be upgraded. */
export const PIN_LENGTH = 6

// Popular picks that pass the pattern rules below (keypad shapes, "love" numbers).
const COMMON = new Set(["147258", "258369", "369258", "159753", "357159", "147369", "789456", "456123", "520520", "520131", "131420", "123321", "654456"])

/**
 * Rejects PINs that are easy to guess: one digit repeated (111111), runs up or
 * down (123456, 987654, 345678), short repeats (121212, 123123, 112233),
 * only two different digits (110011), and common keypad patterns.
 */
export function isWeakPin(pin: string): boolean {
  if (!/^\d+$/.test(pin)) return true
  const d = [...pin].map(Number)
  const steps = d.slice(1).map((x, i) => x - d[i])
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true
  for (const period of [1, 2, 3]) {
    if (pin.length % period === 0 && pin === pin.slice(0, period).repeat(pin.length / period)) return true
  }
  // Doubled digits in a run: 112233, 332211.
  if (pin.length % 2 === 0 && [...pin].every((c, i) => i % 2 === 0 || c === pin[i - 1])) {
    const pairs = pin.replace(/(\d)\1/g, "$1")
    if (isWeakPin(pairs) || new Set(pairs).size === 1) return true
  }
  if (new Set(pin).size <= 2) return true
  return COMMON.has(pin)
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
