import assert from "node:assert/strict"
import { founderApproved } from "./channel"
import { postFooter } from "@/lib/post-footer"
import { describe, it } from "node:test"

import {
  checkFacebookPage,
  facebookConfig,
  facebookFuelCaption,
  facebookHolidayMessage,
  facebookMorningCaption,
  publishPhotoToFacebook,
  publishTextToFacebook,
  redact,
  shouldPublishToFacebook,
} from "./facebook-publisher"

const OK = founderApproved("test")

const TOKEN = "EAAtestTOKEN123secret"
const env = { FB_PAGE_ID: "102345678901234", FB_PAGE_ACCESS_TOKEN: TOKEN }
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const noSleep = async () => {}

/** A fake Graph API: answers in turn, records every call. */
function graph(...answers: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = answers.shift() ?? new Response("{}", { status: 500 })
    if (next instanceof Error) throw next
    return next
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("facebook publisher — config", () => {
  it("off unless both are set and the Page id is numeric", () => {
    assert.equal(facebookConfig({}), null)
    assert.equal(facebookConfig({ FB_PAGE_ID: "123456" }), null)
    assert.equal(facebookConfig({ FB_PAGE_ID: "my-page", FB_PAGE_ACCESS_TOKEN: TOKEN }), null)
    assert.deepEqual(facebookConfig(env), { pageId: "102345678901234", token: TOKEN })
  })
  it("without credentials: skipped, no request at all (Telegram goes on)", async () => {
    const g = graph()
    const res = await publishPhotoToFacebook(OK, png, "x", { env: {}, fetch: g.fetch, sleep: noSleep })
    assert.equal(res.ok, false)
    assert.equal("skipped" in res && res.skipped, true)
    assert.equal(g.calls.length, 0)
  })
})

describe("facebook publisher — posting", () => {
  it("POSTs the PNG, caption and token as form data to /v21.0/{page}/photos — the token never in the URL", async () => {
    const g = graph(json({ id: "999", post_id: "102345678901234_999" }))
    const res = await publishPhotoToFacebook(OK, png, "សួស្តី", { env, fetch: g.fetch, sleep: noSleep })
    assert.deepEqual(res, { ok: true, postId: "102345678901234_999", attempts: 1 })
    assert.equal(g.calls[0].url, "https://graph.facebook.com/v21.0/102345678901234/photos")
    assert.doesNotMatch(g.calls[0].url, /token/i)
    const form = g.calls[0].init!.body as FormData
    assert.equal(form.get("caption"), "សួស្តី")
    assert.equal(form.get("access_token"), TOKEN)
    assert.equal((form.get("source") as Blob).type, "image/png")
  })
  it("a network error then a 500, then success: retried, 3 attempts", async () => {
    const g = graph(new Error("ECONNRESET"), json({ error: { message: "oops", code: 2 } }, 500), json({ id: "1" }))
    const res = await publishPhotoToFacebook(OK, png, "x", { env, fetch: g.fetch, sleep: noSleep })
    assert.deepEqual(res, { ok: true, postId: "1", attempts: 3 })
  })
  it("an expired token (code 190) is not retried; the message never contains the token", async () => {
    const g = graph(json({ error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } }, 400))
    const res = await publishPhotoToFacebook(OK, png, "x", { env, fetch: g.fetch, sleep: noSleep })
    assert.equal(g.calls.length, 1)
    assert.equal(res.ok, false)
    assert.ok(!res.ok && !res.skipped && !res.retryable)
    assert.ok(!res.ok && !res.skipped && !res.error.includes(TOKEN))
    assert.match(!res.ok && !res.skipped ? res.error : "", /code 190/)
  })
  it("still failing after 3 tries: gives up cleanly (no throw)", async () => {
    const g = graph(new Error("timeout"), new Error("timeout"), new Error("timeout"))
    const res = await publishPhotoToFacebook(OK, png, "x", { env, fetch: g.fetch, sleep: noSleep })
    assert.equal(g.calls.length, 3)
    assert.ok(!res.ok && !res.skipped && res.attempts === 3)
  })
  it("throttled (code 4) is retried", async () => {
    const g = graph(json({ error: { message: "rate", code: 4 } }, 400), json({ post_id: "p" }))
    const res = await publishPhotoToFacebook(OK, png, "x", { env, fetch: g.fetch, sleep: noSleep })
    assert.deepEqual(res, { ok: true, postId: "p", attempts: 2 })
  })
})

describe("facebook publisher — caption and checks", () => {
  it("plain-text caption: the day's quote and the standard footer (lib/post-footer.ts); brand-safe", () => {
    const c = facebookMorningCaption("2026-10-13")
    assert.match(c, /^☀️ អរុណសួស្តីថ្ងៃថ្មី/)
    assert.match(c, /«.+»/)
    assert.ok(c.endsWith(postFooter("community", "facebook")))
    assert.ok(c.includes("Android (APK): app.luychlat.com/download · iOS / Web: app.luychlat.com · Telegram Bot: t.me/luychlat_bot")) // Facebook: no inline links
    assert.match(c, /#LuyChlat #អេបលុយឆ្លាត\n#គ្រប់គ្រងហិរញ្ញវត្ថុ/)
    assert.doesNotMatch(c, /<[a-z]|អែប|កម្មវិធី|&/)
  })
  it("the read-only check sends the token as a header, never in the URL", async () => {
    const g = graph(json({ name: "App Luy Chlat" }))
    assert.deepEqual(await checkFacebookPage({ env, fetch: g.fetch }), { ok: true, name: "App Luy Chlat" })
    assert.doesNotMatch(g.calls[0].url, /token/i)
    assert.equal((g.calls[0].init!.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`)
  })
  it("redact scrubs the token and access_token= query values", () => {
    assert.equal(redact(`bad ${TOKEN} and ?access_token=${TOKEN}&x=1`, TOKEN), "bad [token] and ?access_token=[token]&x=1")
  })
})

describe("facebook publisher — curated, not a mirror (founder, 12/10/2026)", () => {
  const before = { regular: 4_100, diesel: 4_200 }
  it("fuel: unchanged EA92 and diesel → Telegram only, no Facebook", () => {
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: { regular: 4_100, diesel: 4_200 }, previous: before }), false)
  })
  it("fuel: no known previous period → no Facebook (no change can be stated)", () => {
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: { regular: 4_000, diesel: 4_250 }, previous: null }), false)
  })
  it("fuel: EA92 or diesel moved → Facebook", () => {
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: { regular: 4_000, diesel: 4_200 }, previous: before }), true)
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: { regular: 4_100, diesel: 4_250 }, previous: before }), true)
    assert.equal(shouldPublishToFacebook({ kind: "silday" }), true) // the Sil day poster (founder, 19/10/2026)
  })
  it("the 20:00 reminder never reaches the Page; the morning poster and holiday notes do", () => {
    assert.equal(shouldPublishToFacebook({ kind: "evening" }), false)
    assert.equal(shouldPublishToFacebook({ kind: "morning" }), true)
    assert.equal(shouldPublishToFacebook({ kind: "holiday" }), true)
  })
  it("the fuel caption leads with the change: «សាំងធម្មតាចុះ -100៛ ▼ | ម៉ាស៊ូតឡើង +50៛ ▲»", () => {
    const c = facebookFuelCaption({ now: { regular: 4_000, diesel: 4_250, super: null }, previous: before, period: "សម្រាប់ថ្ងៃទី ២១ ដល់ ៣០ ខែតុលា ឆ្នាំ ២០២៦", sourceUrl: "https://t.me/mocnewsfeed/1" })
    assert.equal(c.split("\n")[0], "⛽ តម្លៃប្រេងសាំងថ្មី៖ សាំងធម្មតាចុះ -100៛ ▼ | ម៉ាស៊ូតឡើង +50៛ ▲")
    assert.match(c, /• សាំងធម្មតា \(EA92\) ៖ 4,000៛\/លីត្រ/)
    assert.doesNotMatch(c, /EA95/)
    const one = facebookFuelCaption({ now: { regular: 4_100, diesel: 4_150 }, previous: before, period: "p", sourceUrl: "u" })
    assert.equal(one.split("\n")[0], "⛽ តម្លៃប្រេងសាំងថ្មី៖ សាំងធម្មតានៅដដែល | ម៉ាស៊ូតចុះ -50៛ ▼")
  })
  it("a text post goes to /{page}/feed as «message»; the holiday note is plain text", async () => {
    const g = graph(json({ id: "102345678901234_7" }))
    const res = await publishTextToFacebook(OK, facebookHolidayMessage("☀️ សូមស្វាគមន៍", "body"), { env, fetch: g.fetch, sleep: noSleep })
    assert.deepEqual(res, { ok: true, postId: "102345678901234_7", attempts: 1 })
    assert.equal(g.calls[0].url, "https://graph.facebook.com/v21.0/102345678901234/feed")
    assert.match(String((g.calls[0].init!.body as FormData).get("message")), /^☀️ សូមស្វាគមន៍\n\nbody\n/)
  })
})

describe("facebook publisher — the weekly spotlight", () => {
  it("the Saturday spotlight reaches the Page", () => {
    assert.equal(shouldPublishToFacebook({ kind: "spotlight" }), true)
  })
})
