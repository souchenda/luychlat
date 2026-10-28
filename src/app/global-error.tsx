"use client"

import { useEffect } from "react"

import { CHUNK_RELOADED_KEY, shouldReloadForChunk } from "@/lib/stale-build"

/**
 * The last safety net (founder, 28/10/2026 — «never a blank screen, never stuck»): instead of Next's English
 * «Application error», a calm card in Khmer and English with one button. A page left on the previous build that lost a
 * code chunk in an update reloads by itself, once (lib/stale-build.ts). It replaces the root layout, so it carries its
 * own <html>, <body> and styles and imports nothing of the app.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    let reloadedFor: string | null = null
    try {
      reloadedFor = sessionStorage.getItem(CHUNK_RELOADED_KEY)
    } catch {
      // no storage
    }
    const running = process.env.NEXT_PUBLIC_BUILD_ID ?? null
    if (!shouldReloadForChunk({ message: `${error.name} ${error.message}`, running, pathname: location.pathname, reloadedFor })) return
    try {
      sessionStorage.setItem(CHUNK_RELOADED_KEY, running ?? "unknown")
    } catch {
      // ignored
    }
    location.reload()
  }, [error])

  return (
    <html lang="km">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3faf7", color: "#0f172a", fontFamily: '"Kantumruy Pro", "Noto Sans Khmer", "Khmer UI", system-ui, sans-serif', padding: 16 }}>
        <main style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #d1e7dd", borderRadius: 24, padding: "32px 24px 24px", textAlign: "center", boxShadow: "0 10px 30px rgba(15,159,110,.08)" }}>
          <p style={{ margin: "0 0 16px", fontWeight: 700, color: "#0f9f6e" }}>អេប លុយឆ្លាត · App Luy Chlat</p>
          <h1 style={{ fontSize: 19, lineHeight: 1.6, margin: "0 0 8px" }}>សូមអភ័យទោស មានបញ្ហាបន្តិចបន្តួច</h1>
          <p style={{ margin: 0, color: "#475569", lineHeight: 1.75 }}>ទិន្នន័យរបស់អ្នកមានសុវត្ថិភាព។ សូមចុចប៊ូតុងខាងក្រោម ដើម្បីបើកឡើងវិញ។</p>
          <p lang="en" style={{ margin: "14px 0 0", paddingTop: 14, borderTop: "1px dashed #d1e7dd", color: "#475569", fontSize: 14, lineHeight: 1.6 }}>
            Something went wrong. Your data is safe — tap below to open the app again.
          </p>
          <button
            type="button"
            onClick={() => {
              reset()
              location.reload()
            }}
            style={{ marginTop: 22, width: "100%", minHeight: 48, border: 0, borderRadius: 14, background: "#0f9f6e", color: "#fff", font: "inherit", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
          >
            បើកឡើងវិញ · Reload
          </button>
        </main>
      </body>
    </html>
  )
}
