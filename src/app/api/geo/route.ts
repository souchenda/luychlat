import { NextResponse } from "next/server"

import { networkPlace } from "@/lib/network-place"
import { PROVINCES } from "@/lib/prayer"

/**
 * GET → the nearest province from the network (lib/network-place.ts) — the prayer times' fallback when the phone gives
 * no GPS. Only Cloudflare's location headers are read; no IP, nothing stored, never cached.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(req: Request) {
  return NextResponse.json(networkPlace(req.headers, PROVINCES), { headers: { "Cache-Control": "no-store" } })
}
