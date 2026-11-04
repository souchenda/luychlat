import { NextResponse } from "next/server"

import { formatMoney } from "@/lib/money"
import { validPhone } from "@/lib/order-ahead"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { botDb, botKey, sendText } from "@/lib/server/telegram-bot"

/**
 * Order-ahead (founder, 4/11/2026 — docs/order-ahead.md): GET the shop's public menu, POST a new order. No sign-in: the
 * database checks the shop is open (BUSINESS, its owner on ULTRA with the feature) and prices the order from the menu
 * (public.order_create); this route only limits the rate, checks the form and tells the owner.
 */
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = guardRequest(request, { name: "order-menu", limit: 60, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const { slug } = await params
  const { data, error } = await botDb().rpc("order_public_menu", { p_key: botKey(), p_slug: slug })
  if (error) return NextResponse.json({ status: "error" }, { status: 500 })
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}

type Body = { items?: unknown; name?: unknown; phone?: unknown; pickup?: unknown; note?: unknown }

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // A few orders a minute per person at most: a shop's menu is not a target.
  const blocked = guardRequest(request, { name: "order-create", limit: 6, windowMs: 60_000, maxBytes: 20_000 })
  if (blocked) return blocked
  const { slug } = await params
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 })
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : ""
  const phone = typeof body.phone === "string" ? body.phone.trim() : ""
  const pickup = typeof body.pickup === "string" ? body.pickup : ""
  if (!name || !validPhone(phone) || !Array.isArray(body.items) || !body.items.length || Number.isNaN(Date.parse(pickup))) {
    return NextResponse.json({ status: "invalid" }, { status: 400 })
  }
  const { data, error } = await botDb().rpc("order_create", {
    p_key: botKey(),
    p_slug: slug,
    p_items: body.items,
    p_name: name,
    p_phone: phone,
    p_pickup: pickup,
    p_note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
  })
  const r = data as { status: string; token?: string; code?: string; total?: number | string; currency?: "USD" | "KHR"; workspace_id?: string; reason?: string } | null
  if (error || !r) {
    logEvent("warn", "orders", `Order not created: ${error?.message ?? "no answer"}`, { fold: true })
    return NextResponse.json({ status: "error" }, { status: 500 })
  }
  if (r.status !== "ok" || !r.token) return NextResponse.json(r, { status: r.status === "closed" ? 404 : 400 })

  // The owner, in their private chat: a new order to watch for (paid or not yet).
  const { data: chats } = await botDb().rpc("bot_biz_owner_chats", { p_key: botKey(), p_workspace_id: r.workspace_id, p_group: null })
  const owners = (chats as { chat_id: number }[] | null) ?? []
  const pickupAt = new Date(Date.parse(pickup) + 7 * 3_600_000).toISOString().slice(11, 16)
  let reached = 0
  for (const o of owners) {
    const res = await sendText(Number(o.chat_id), `🛎 ការកម្មង់ថ្មី ${r.code} · ${formatMoney(Number(r.total), r.currency ?? "USD")}\n👤 ${name}\n⏰ មកយកម៉ោង ${pickupAt}\n⏳ រង់ចាំការបង់ប្រាក់ — មើលក្នុងអេប › ការកម្មង់`, {
      reply_markup: { inline_keyboard: [[{ text: "📋 បើកការកម្មង់", url: "https://app.luychlat.com/business/orders" }]] },
    })
    if (res.ok) reached += 1
  }
  logEvent(reached ? "info" : "warn", "orders", `New order ${r.code}: the owner told in ${reached} of ${owners.length} chat(s)`, { fold: true })
  return NextResponse.json({ status: "ok", token: r.token, code: r.code })
}
