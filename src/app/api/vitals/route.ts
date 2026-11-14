import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { guardRequest, readJson } from "@/lib/server/guard"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { parseVital } from "@/lib/web-vitals"

/**
 * The app's real speed (founder, 14/11/2026 — src/lib/web-vitals.ts): a signed-in member's page view reports its Web
 * Vitals here — up to 5 at once, validated, stored without the person (public.web_vitals, read only as p75 per screen
 * by a super admin). Rows older than 30 days are trimmed now and then.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const service = () => createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "vitals", limit: 30, windowMs: 60_000, maxBytes: 2_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 })
  const body = (await readJson(request, 2_000)) as { vitals?: unknown } | null
  const rows = (Array.isArray(body?.vitals) ? body.vitals : []).slice(0, 5).map(parseVital).filter((v) => v !== null)
  if (!rows.length) return NextResponse.json({ ok: false }, { status: 400 })
  const db = service()
  await db.from("web_vitals").insert(rows)
  if (Math.random() < 0.01) await db.from("web_vitals").delete().lt("at", new Date(Date.now() - 30 * 86_400_000).toISOString())
  return NextResponse.json({ ok: true, stored: rows.length })
}
