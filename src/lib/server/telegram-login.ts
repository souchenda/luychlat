// Server only: Telegram Login Widget data checked as Telegram documents it
// (core.telegram.org/widgets/login#checking-authorization): the data-check-string is every field but
// `hash`, sorted, as "key=value" lines; the hash is its HMAC-SHA256 keyed with SHA-256(bot token).
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

export type TelegramLogin = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string; auth_date: number; hash: string }

const FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"] as const

/** The Telegram user's id when the data is genuine and fresh (≤ maxAge seconds old), else null. */
export function verifyTelegramLogin(raw: unknown, botToken: string, nowSec = Math.floor(Date.now() / 1000), maxAge = 600): number | null {
  if (!raw || typeof raw !== "object" || !botToken) return null
  const data = raw as Record<string, unknown>
  const hash = typeof data.hash === "string" && /^[0-9a-f]{64}$/.test(data.hash) ? data.hash : null
  const id = Number(data.id)
  const authDate = Number(data.auth_date)
  if (!hash || !Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(authDate)) return null
  if (authDate > nowSec + 60 || nowSec - authDate > maxAge) return null
  const lines = FIELDS.filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== "")
    .sort()
    .map((k) => `${k}=${String(data[k])}`)
  const secret = createHash("sha256").update(botToken).digest()
  const expected = createHmac("sha256", secret).update(lines.join("\n")).digest()
  const given = Buffer.from(hash, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}

/** The bot's numeric id (the part of the token before ":") — public, the widget needs it. */
export const botIdFromToken = (token: string | undefined) => (token?.match(/^(\d+):/)?.[1] ?? null)
