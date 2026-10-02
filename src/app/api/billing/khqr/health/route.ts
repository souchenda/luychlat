import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"

import { checkTransactionByMd5 } from "@/lib/server/bakong"
import { khqrConfig } from "@/lib/server/khqr-config"
import { currentUser } from "@/lib/server/khqr-service"
import { guardRequest } from "@/lib/server/guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Admin check: KHQR mode, missing settings, and whether this server can reach
 * Bakong with its token (asks for a random MD5; "not found" means it works).
 * Shows a 403 when Bakong refuses the token or this server's region.
 */
export async function GET(request: Request) {
  const blocked = guardRequest(request, { name: "khqr-health", limit: 10, windowMs: 60_000, maxBytes: 0 })
  if (blocked) return blocked
  const session = await currentUser()
  if (!session) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })
  const { data: isAdmin } = await session.supabase.rpc("is_admin")
  if (isAdmin !== true) return NextResponse.json({ error: "admins_only" }, { status: 403 })

  const requested = (process.env.KHQR_MODE ?? "off").toLowerCase()
  const cfg = khqrConfig()
  const base = {
    requested_mode: requested,
    mode: cfg.mode,
    problems: cfg.problems,
    account: cfg.accountId || null,
    merchant_name: cfg.merchantName,
    api_url: cfg.apiUrl,
    has_token: Boolean(cfg.apiToken),
  }
  if (!cfg.apiToken) return NextResponse.json({ ...base, bakong: { kind: "skipped", message: "no token" } })
  const started = Date.now()
  const result = await checkTransactionByMd5(randomBytes(16).toString("hex"), cfg)
  return NextResponse.json({
    ...base,
    bakong: {
      kind: result.kind,
      ok: result.kind === "not_found",
      message: result.kind === "error" ? result.message : result.kind === "not_found" ? "reachable, token accepted" : "unexpected",
      ms: Date.now() - started,
    },
  })
}
