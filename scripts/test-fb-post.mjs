#!/usr/bin/env node
/**
 * Facebook Page check for the 07:00 mirror (src/lib/server/facebook-publisher.ts).
 *
 *   node --env-file=/opt/luysmart/.env scripts/test-fb-post.mjs
 *       Read-only: confirms FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN reach the Page and prints its name.
 *       Posts nothing.
 *
 *   node --env-file=/opt/luysmart/.env scripts/test-fb-post.mjs --send poster.png
 *       Publishes poster.png to the Page with a short test caption (a real, public post — delete
 *       it from the Page afterwards if it was only a test).
 *
 * The token is read from the environment only, sent in the request body (never in a URL), and never
 * printed.
 */
import { readFileSync } from "node:fs"

const GRAPH = "https://graph.facebook.com/v21.0"
const pageId = process.env.FB_PAGE_ID?.trim()
const token = process.env.FB_PAGE_ACCESS_TOKEN?.trim()
const redact = (s) => (token ? String(s).split(token).join("[token]") : String(s))

if (!pageId || !token || !/^\d{5,25}$/.test(pageId)) {
  console.error("✗ FB_PAGE_ID (numeric Page id) and FB_PAGE_ACCESS_TOKEN must both be set.")
  process.exit(1)
}

const sendIdx = process.argv.indexOf("--send")
try {
  if (sendIdx === -1) {
    const res = await fetch(`${GRAPH}/${pageId}?fields=name`, { headers: { Authorization: `Bearer ${token}` } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.name) throw new Error(`HTTP ${res.status}: ${body.error?.message ?? "no name"}`)
    console.log(`✓ Token works for the Page «${body.name}» (${pageId}). Nothing was posted.`)
  } else {
    const file = process.argv[sendIdx + 1]
    if (!file) throw new Error("--send needs a PNG file: --send poster.png")
    const form = new FormData()
    form.set("source", new Blob([readFileSync(file)], { type: "image/png" }), "luychlat-test.png")
    form.set("caption", "☀️ អេប លុយឆ្លាត · test post from scripts/test-fb-post.mjs")
    form.set("access_token", token)
    const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: "POST", body: form })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !(body.post_id || body.id)) throw new Error(`HTTP ${res.status}: ${body.error?.message ?? "no post id"}`)
    console.log(`✓ Published: post ${body.post_id ?? body.id}`)
  }
} catch (e) {
  console.error(`✗ ${redact(e instanceof Error ? e.message : e)}`)
  process.exit(1)
}
