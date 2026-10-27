import { NextResponse } from "next/server"

/** Liveness probe for Docker HEALTHCHECK, DigitalOcean App Platform and load balancers; `build` — the live build (Task #526). */
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ status: "ok", uptime: Math.round(process.uptime()), build: process.env.NEXT_PUBLIC_BUILD_ID ?? null }, { headers: { "Cache-Control": "no-store" } })
}
