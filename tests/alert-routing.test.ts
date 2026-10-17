// The founder's chat is for business (founder, 17/10/2026): signups and sales there; previews to the marketing
// chat when set; server messages to the DevOps chat when set; and Telegram for the server only when it is really
// down for 5+ minutes — never a CPU warning.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { sourceForAlert } from "../src/lib/acquisition"
import { PAGE_AFTER_MS, shouldPage } from "../src/lib/server/health-watchdog"

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8")

describe("server alerts — only a real outage, after 5 minutes", () => {
  const t0 = Date.parse("2026-10-17T07:00:00Z")
  it("CPU, RAM, disk, app memory and a slow database never page", () => {
    for (const issue of ["cpu", "ram", "disk", "app_mem", "db_slow"] as const) assert.equal(shouldPage(issue, t0, t0 + 60 * 60_000), false, issue)
  })
  it("the database down / the site unreachable for Telegram: paged after 5 minutes, not before", () => {
    assert.equal(shouldPage("db_down", t0, t0 + 4 * 60_000), false)
    assert.equal(shouldPage("db_down", t0, t0 + PAGE_AFTER_MS), true)
    assert.equal(shouldPage("webhook", t0, t0 + 6 * 60_000), true)
  })
  it("the watchdog no longer messages every admin; the weekly summary is a DevOps log", () => {
    const w = src("lib/server/health-watchdog.ts")
    assert.doesNotMatch(w, /bot_admin_chats/)
    assert.doesNotMatch(w, /sendToAdmins/)
    assert.match(w, /devopsChats\(\{ critical: true \}\)/)
  })
})

describe("previews to the marketing chat; their buttons checked by the person who taps", () => {
  it("the 06:15 / 07:00 previews and the 12:00 tip use the marketing route", () => {
    assert.match(src("lib/server/scheduled-posts.ts"), /adminChats: \(\) => marketingChats\(\)/)
    assert.match(src("lib/server/tip-bot.ts"), /const chats = await marketingChats\(\)/)
  })
  it("in a group, the tapping super admin is checked (their user id = their private chat id)", () => {
    assert.match(src("lib/server/scheduled-posts.ts"), /const actor = chat\?\.type === "private" \? chat\.id : cb\.from\?\.id/)
    assert.match(src("lib/server/tip-bot.ts"), /const actor = isPrivate \? chatId : cb\.from\?\.id/)
    assert.equal(src("lib/server/tip-bot.ts").match(/p_chat_id: actor/g)?.length, 2)
  })
})

describe("signups — «🎉 … · ស្គាល់តាម៖ …» in the founder's chat", () => {
  it("the source: one of the four, a typed «other», or not answered yet", () => {
    assert.equal(sourceForAlert("facebook"), "facebook")
    assert.deepEqual(sourceForAlert("other: tiktok"), { other: "tiktok" })
    assert.equal(sourceForAlert(null), null)
  })
  it("the alert's headline names the person and where they heard of the app", () => {
    const km = src("lib/i18n/dictionaries.ts")
    assert.match(km, /"bot\.signupAlert": "🎉 អ្នកប្រើប្រាស់ថ្មីបានចុះឈ្មោះ៖ \{who\} · ស្គាល់តាម៖ \{source\}/)
  })
})
