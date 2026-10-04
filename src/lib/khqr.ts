/**
 * KHQR is an EMVCo merchant-presented QR: "ID LEN VALUE" fields, ending with
 * a CRC-16/CCITT checksum (tag 63). We only read it — the user's own code is
 * redrawn exactly as it is, never changed (no amount is added), so every bank
 * app reads it the same way as the original.
 */

export type KhqrInfo = {
  /** Merchant / account name (tag 59). */
  name: string | null
  /** Currency of the code (tag 53: 840 USD, 116 KHR), when it says. */
  currency: "USD" | "KHR" | null
  /** A fixed amount inside the code (tag 54), when there is one. */
  amount: number | null
}

/** Top-level fields of an EMV QR payload, or null when it isn't one. */
export function parseEmv(payload: string): Map<string, string> | null {
  const fields = new Map<string, string>()
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const len = Number(payload.slice(i + 2, i + 4))
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(payload.slice(i + 2, i + 4)) || i + 4 + len > payload.length) return null
    fields.set(id, payload.slice(i + 4, i + 4 + len))
    i += 4 + len
  }
  return fields
}

/** CRC-16/CCITT-FALSE, as EMV QR uses it. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

/** True for a well-formed KHQR / EMV payload with a correct checksum. */
export function isKhqr(payload: string): boolean {
  if (!/^000201/.test(payload) || payload.length < 20 || payload.length > 512) return false
  const fields = parseEmv(payload)
  const crc = fields?.get("63")
  if (!fields || !crc || !payload.endsWith(`6304${crc}`)) return false
  return crc16(payload.slice(0, -4)) === crc.toUpperCase()
}

export function khqrInfo(payload: string): KhqrInfo {
  const fields = parseEmv(payload) ?? new Map<string, string>()
  const code = fields.get("53")
  const amount = Number(fields.get("54"))
  return {
    name: fields.get("59")?.trim() || null,
    currency: code === "840" ? "USD" : code === "116" ? "KHR" : null,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
  }
}
