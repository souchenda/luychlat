import { NextResponse } from "next/server"

/**
 * Shared protections for the API routes. These routes never touch the
 * database (they relay the user's own Telegram/AI key, also in Guest Mode),
 * so they are guarded by origin, size and rate rather than by a session.
 */

type Bucket = { count: number; reset: number }
const buckets = new Map<string, Bucket>()

/**
 * Visitor IP: Cloudflare's CF-Connecting-IP (behind Cloudflare every request
 * comes from a Cloudflare address), else Nginx's X-Real-IP, else the first
 * X-Forwarded-For hop. A forged header only lets a caller pick their own
 * bucket; it can't lift the limit for anyone else.
 */
export function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

/** Fixed-window limiter in memory (one app instance on the Droplet). */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k)
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  bucket.count++
  return bucket.count > limit ? { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) } : { ok: true, retryAfter: 0 }
}

/**
 * Rejects cross-site calls (other websites can't use this server as a relay),
 * oversized bodies and bursts. Returns a response to send, or null to continue.
 */
export function guardRequest(
  request: Request,
  opts: { name: string; limit: number; windowMs: number; maxBytes: number },
): NextResponse | null {
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (origin) {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      // malformed Origin header
    }
    if (!host || originHost !== host) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  }
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > opts.maxBytes) return NextResponse.json({ error: "payload_too_large" }, { status: 413 })

  const { ok, retryAfter } = rateLimit(`${opts.name}:${clientIp(request)}`, opts.limit, opts.windowMs)
  if (!ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfter) } })
  }
  return null
}

/** Reads a JSON body with a hard size cap (Content-Length can be absent or wrong). */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text()
  if (text.length > maxBytes) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
