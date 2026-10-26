import { NextResponse } from "next/server"

import { parseErpPayload, verifyErpSignature } from "@/lib/erp-sync"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey } from "@/lib/server/telegram-bot"

/**
 * SL Staff ERP → LuyChlat (founder, 26/10/2026 — Task #515, phase 1 of #511). The depot ERP pushes each money movement
 * of DL MEAT SUPPLY; it is recorded in that business workspace only (public.erp_sync_apply — the workspace and its
 * wallets are configured in public.erp_sync_config, never taken from the request). No SoundBox for these entries.
 *
 *   POST /api/integrations/erp-sync
 *   x-erp-timestamp: <unix seconds or ms>                 (within 5 minutes of now — a captured request can't be replayed)
 *   x-erp-signature: sha256=<hex HMAC-SHA256(ERP_SYNC_SECRET, "<timestamp>.<raw body>")>
 *   { "action": "create", "reference_id": "OE-1042", "type": "expense" | "income" | "owner_draw", "amount": 120.5,
 *     "currency": "USD" | "KHR", "category": "stock", "note": "…", "payment_method": "bank" | "cash", "date": "2026-10-26" }
 *   { "action": "void", "reference_id": "OE-1042" }
 *
 * Answers: 201 created · 200 duplicate / voided / already_void / unknown (safe to retry) · 401 bad signature ·
 * 408 stale timestamp · 413 too large · 422 invalid or unmapped (the ERP's outbox keeps it) · 503 not set up.
 */
export const runtime = "nodejs"

const MAX_BODY = 16_000

export async function POST(request: Request) {
  const secret = process.env.ERP_SYNC_SECRET?.trim()
  // Off until the founder sets the secret on the server: nothing is accepted without it.
  if (!secret || secret.length < 32) return NextResponse.json({ ok: false, status: "not_configured" }, { status: 503 })
  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false, status: "too_large" }, { status: 413 })
  const check = verifyErpSignature({ secret, timestamp: request.headers.get("x-erp-timestamp"), raw, signature: request.headers.get("x-erp-signature"), now: Date.now() })
  if (check !== "ok") {
    logEvent("warn", "erp-sync", `Refused: ${check === "stale" ? "timestamp too old or new" : "bad signature"}`, { fold: true })
    return NextResponse.json({ ok: false, status: check === "stale" ? "stale" : "unauthorized" }, { status: check === "stale" ? 408 : 401 })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, status: "invalid", error: "body must be JSON" }, { status: 422 })
  }
  const parsed = parseErpPayload(body)
  if (!parsed.ok) return NextResponse.json({ ok: false, status: "invalid", error: parsed.error }, { status: 422 })

  const { data, error } = await botDb().rpc("erp_sync_apply", { p_key: botKey(), p_payload: parsed.payload })
  if (error) {
    const code = /unmapped_account|currency_mismatch|invalid_\w+/.exec(error.message)?.[0] ?? (/not_configured|not_business/.test(error.message) ? "not_configured" : null)
    logEvent(code ? "warn" : "error", "erp-sync", `Not recorded (${parsed.payload.reference_id}): ${code ?? error.message}${error.details ? ` ${error.details}` : ""}`, { fold: true })
    if (code === "not_configured") return NextResponse.json({ ok: false, status: "not_configured" }, { status: 503 })
    if (code) return NextResponse.json({ ok: false, status: code, detail: error.details ?? null }, { status: 422 })
    return NextResponse.json({ ok: false, status: "error" }, { status: 500 })
  }
  const r = data as { status: string; transaction_id?: string; draw?: string | null }
  if (r.status === "created") logEvent("info", "erp-sync", `Recorded ${parsed.payload.reference_id}${r.draw ? ` (owner's draw: ${r.draw})` : ""}`, { fold: true })
  if (r.draw === "no_draw_wallet" || r.draw === "invalid_draw_wallet") logEvent("warn", "erp-sync", `Owner's draw ${parsed.payload.reference_id} recorded in the business only: ${r.draw}`, { fold: true })
  return NextResponse.json({ ok: true, ...r }, { status: r.status === "created" ? 201 : 200 })
}
