import { NextResponse } from "next/server"

import { isAdminCaller } from "@/lib/server/admin-auth"
import { guardRequest } from "@/lib/server/guard"
import { parseMonitors, type UptimeMonitor } from "@/lib/uptime-robot"

/**
 * Admin › Super › Control Center › UptimeRobot (founder, 5/11/2026): the monitors he set up at UptimeRobot, read with
 * his READ-ONLY API key (UPTIMEROBOT_API_KEY — he enters it on the Droplet; it never reaches the browser). Super admins
 * only; one call to UptimeRobot a minute at most (cached), whatever the number of viewers.
 */
export const runtime = "nodejs"

let cache: { at: number; monitors: UptimeMonitor[] | null; error?: string } | null = null

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "admin-uptime", limit: 20, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const admin = await isAdminCaller(request)
  if (!admin || admin.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const key = process.env.UPTIMEROBOT_API_KEY?.trim()
  if (!key) return NextResponse.json({ configured: false })
  if (!cache || Date.now() - cache.at > 60_000) {
    try {
      const res = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
        body: new URLSearchParams({ api_key: key, format: "json", custom_uptime_ratios: "1-7", response_times: "1", response_times_limit: "1", logs: "1", logs_limit: "5" }),
        signal: AbortSignal.timeout(10_000),
      })
      const monitors = parseMonitors(await res.json().catch(() => null))
      cache = { at: Date.now(), monitors, error: monitors ? undefined : "api" }
    } catch {
      cache = { at: Date.now(), monitors: null, error: "unreachable" }
    }
  }
  return NextResponse.json({ configured: true, checkedAt: new Date(cache.at).toISOString(), monitors: cache.monitors, error: cache.error ?? null })
}
