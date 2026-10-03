import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { guardRequest } from "@/lib/server/guard"
import { syncMarket } from "@/lib/server/market-sync"
import { botToken } from "@/lib/server/telegram-bot"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

/**
 * "🔄 Refresh rates" for signed-in users: fetches the NBC rates and gold spot
 * now. The sync itself runs at most every 5 minutes, so tapping repeatedly
 * only returns the latest stored data.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "market-refresh", limit: 6, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  if (!botToken()) return NextResponse.json({ error: "unavailable" }, { status: 503 })

  // Signed-in users only (the token is checked by Supabase).
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const db = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.auth.getUser(auth.slice(7))
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  return NextResponse.json(await syncMarket())
}
