import { NextResponse } from "next/server"

import { schedulerState } from "@/lib/function-watch"
import { dispatcherExpected, heartbeat } from "@/lib/server/heartbeat"

/**
 * Liveness probe for Docker HEALTHCHECK, DigitalOcean App Platform and load balancers; `build` — the live build (Task #526).
 * Always HTTP 200 while the server answers (Docker and the blue / green switch read only that). The body says
 * `"status":"ok"` only while the scheduler (every post, reminder and alert) runs too — else `"status":"degraded"` with
 * `scheduler` «stuck» / «stalled», which UptimeRobot's keyword monitor (`"status":"ok"`) reports from outside
 * (founder, 6/11/2026 — the dead-man switch).
 */
export const dynamic = "force-dynamic"

export function GET() {
  const scheduler = dispatcherExpected() ? schedulerState(heartbeat(), Date.now()) : "ok"
  return NextResponse.json(
    { status: scheduler === "ok" ? "ok" : "degraded", ...(scheduler === "ok" ? {} : { scheduler }), uptime: Math.round(process.uptime()), build: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store" } },
  )
}
