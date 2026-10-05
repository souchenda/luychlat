import { NextResponse } from "next/server"

import { isTelegramReceipt } from "@/lib/pool"
import { telegramFile } from "@/lib/server/telegram-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * A receipt photo kept on Telegram (<owner>/tg/<file id>), for a signed-in
 * user who can see an entry with that receipt (checked through RLS).
 */
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref") ?? ""
  if (!isTelegramReceipt(ref)) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })
  const { data } = await supabase.from("transactions").select("id").eq("receipt_url", ref).limit(1)
  if (!data?.length) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const file = await telegramFile(ref.split("/tg/")[1])
  if (!file) return NextResponse.json({ error: "unavailable" }, { status: 502 })
  return new NextResponse(file.bytes, { headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=3600" } })
}
