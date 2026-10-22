import { NextResponse } from "next/server"

import { appVersionInfo } from "@/lib/apk-version"

/**
 * GET → the newest Android app (lib/apk-version.ts): { latestVersion, versionCode, downloadUrl, changelogKhmer } — the
 * installed APK compares its own build with it and offers the update (Task #468). Public, nothing personal, never cached.
 */
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json(appVersionInfo(), { headers: { "Cache-Control": "no-store" } })
}
