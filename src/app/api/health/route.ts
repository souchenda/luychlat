import { NextResponse } from "next/server"

/** Liveness probe for Docker HEALTHCHECK, DigitalOcean App Platform and load balancers. */
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ status: "ok", uptime: Math.round(process.uptime()) }, { headers: { "Cache-Control": "no-store" } })
}
