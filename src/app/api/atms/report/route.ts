import { NextResponse } from "next/server"

import { BANKS } from "@/lib/atm"
import { sendAdminCard } from "@/lib/server/atm-report"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * «ប្រាប់ទូ ATM ដែលខ្វះ» from /atms: the signed-in user's GPS point at the ATM, its bank and a short
 * note → atm_reports (PENDING), then the approval card to the super admins' Telegram.
 */
export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "atm-report", limit: 5, windowMs: 60_000, maxBytes: 2_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { bank?: unknown; lat?: unknown; lng?: unknown; accuracy?: unknown; note?: unknown } | null
  const bank = typeof body?.bank === "string" && BANKS.some((b) => b.code === body.bank) ? body.bank : null
  const lat = Number(body?.lat)
  const lng = Number(body?.lng)
  const accuracy = Number.isFinite(Number(body?.accuracy)) ? Math.round(Number(body?.accuracy)) : null
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 120) : null
  if (!bank || !(lat >= 9.5 && lat <= 15) || !(lng >= 102 && lng <= 108)) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const { data: id, error } = await supabase.rpc("submit_atm_report", { p_bank: bank, p_lat: lat, p_lng: lng, p_accuracy: accuracy, p_note: note })
  if (error) return NextResponse.json({ error: /too_many/.test(error.message) ? "too_many" : "failed" }, { status: /too_many/.test(error.message) ? 429 : 500 })
  try {
    await sendAdminCard(id as string)
  } catch (e) {
    logEvent("error", "atm-report", `Admin card not sent: ${(e as Error).message}`, { fold: true })
  }
  return NextResponse.json({ ok: true })
}
