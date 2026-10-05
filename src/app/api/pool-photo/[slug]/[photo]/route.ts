import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { isTelegramReceipt } from "@/lib/pool"
import { telegramFile } from "@/lib/server/telegram-bot"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

export const runtime = "nodejs"

/**
 * A receipt photo on a public pool page (/p/<slug>): only for a pool shared
 * with photos on, looked up by the entry's photo key (pool_public_photo).
 * Telegram photos are streamed; uploaded ones redirect to a short-lived link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; photo: string }> }) {
  const { slug, photo } = await params
  if (!/^[a-f0-9]{32}$/.test(slug) || !/^[a-f0-9]{16}$/.test(photo)) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ref } = await supabase.rpc("pool_public_photo", { p_slug: slug, p_photo: photo })
  if (typeof ref !== "string" || !ref) return NextResponse.json({ error: "not_found" }, { status: 404 })

  if (isTelegramReceipt(ref)) {
    const file = await telegramFile(ref.split("/tg/")[1])
    if (!file) return NextResponse.json({ error: "unavailable" }, { status: 502 })
    return new NextResponse(file.bytes, { headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=600" } })
  }
  const { data } = await supabase.storage.from("receipts").createSignedUrl(ref, 10 * 60)
  if (!data?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.redirect(data.signedUrl, { status: 302 })
}
