import { NextResponse } from "next/server"

import { vapidPublicKey } from "@/lib/server/web-push"

/**
 * The public half of the push key pair (safe to hand out — it only lets a phone
 * subscribe to this server). 404 while push isn't set up: the app then hides its prompt.
 */
export const dynamic = "force-dynamic"

export function GET() {
  const key = vapidPublicKey()
  return key ? NextResponse.json({ key }) : NextResponse.json({ key: null }, { status: 404 })
}
