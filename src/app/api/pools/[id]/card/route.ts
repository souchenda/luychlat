import { NextResponse } from "next/server"

import { toSnapshot, type PoolSnapshot } from "@/lib/pool"
import { guardRequest } from "@/lib/server/guard"
import { poolCard } from "@/lib/server/pool-card"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The pool's summary card (PNG, the same as the bot's closing post) for the pool
 * page's download / share. Read as the signed-in user (pool_view checks access).
 */
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardRequest(request, { name: "pool-card", limit: 20, windowMs: 60_000, maxBytes: 0 })
  if (blocked) return blocked
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("pool_view", { p_pool_id: id })
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const png = poolCard(toSnapshot(data as PoolSnapshot))
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="luychlat-pool-${id.slice(0, 8)}.png"`,
      "Cache-Control": "private, no-store",
    },
  })
}
