import { NextResponse } from "next/server"

import { guardRequest } from "@/lib/server/guard"
import { announcePoolKhqr } from "@/lib/server/pool-flow"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * After the treasurer sets the pool's KHQR in the app: post it (with who is still
 * waiting) in the pool's Telegram group. Signed-in writers of the pool only.
 */
export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardRequest(request, { name: "pool-khqr-announce", limit: 6, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const supabase = await createSupabaseServerClient()
  const { data: chat, error } = await supabase.rpc("pool_tg_chat", { p_pool_id: id })
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (!chat) return NextResponse.json({ sent: false, reason: "no_group" })
  const sent = await announcePoolKhqr(Number(chat))
  return NextResponse.json({ sent })
}
