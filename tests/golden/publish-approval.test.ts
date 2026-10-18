// GOLDEN GUARD — zero public posts without the founder's approval (founder, 18/10/2026). The community
// channel's id is handed out only against a FounderApproval (lib/server/channel.ts), and the Facebook publish
// functions take one too. This guard fails the build if any other file reads the channel id from the
// environment, makes an approval, or if a scheduled post could be published by the timer unapproved.
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, it } from "node:test"

import { plannedIslamicPosts, plannedPosts, takeAllowed } from "../../src/lib/scheduled-posts"
import { channelFor } from "../../src/lib/islamic-channel"

const ROOT = join(process.cwd(), "src")
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, p).replace(/\\/g, "/")] : []
  })
}
const files = walk(ROOT).map((f) => ({ f, src: readFileSync(join(ROOT, f), "utf8") }))
const users = (re: RegExp) => files.filter((x) => re.test(x.src)).map((x) => x.f).sort()

describe("GOLDEN · publish only with the founder's approval", () => {
  it("only lib/server/channel.ts reads the community channel from the environment", () => {
    assert.deepEqual(users(/process\.env\.TELEGRAM_COMMUNITY_/), ["lib/server/channel.ts"])
  })
  it("an approval is made only where the founder's decision is checked", () => {
    assert.deepEqual(users(/founderApproved\(/), [
      "lib/server/festival-poster.ts", // the founder's own 📢 (super admin checked)
      "lib/server/scheduled-posts.ts", // a post the database let leave PENDING / APPROVED by the founder's tap
      "lib/server/tip-bot.ts", // the tip the founder approved, or the correction they confirmed
    ])
  })
  it("the channel's id «to identify it» only in the group guard and the admin status page", () => {
    assert.deepEqual(users(/communityChannelRef\(/), ["app/api/admin/system/route.ts", "lib/server/group-guard.ts"])
  })
  it("the Islamic channel (@LuyChlatIslamic) has the same single door, behind the same approval", () => {
    assert.deepEqual(users(/process\.env\.TELEGRAM_ISLAMIC_/), ["lib/server/channel.ts"])
    assert.deepEqual(users(/islamicChannel\(/), ["lib/server/channel.ts", "lib/server/scheduled-posts.ts"]) // defined, and used only for an approved scheduled post
    assert.deepEqual(users(/islamicChannelRef\(/), ["lib/server/group-guard.ts"])
    assert.match(readFileSync(join(ROOT, "lib/server/channel.ts"), "utf8"), /export function islamicChannel\(approval: FounderApproval\)/)
  })
  it("a Buddhist holy-day note never reaches the Islamic channel; Islamic posts never the general one", () => {
    assert.equal(channelFor("HOLYDAY"), "community")
    for (const k of ["ISLAMIC_DAILY", "ISLAMIC_FAST", "ISLAMIC_JUMUAH"]) assert.equal(channelFor(k), "islamic")
    const sp = readFileSync(join(ROOT, "lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /const chat = islamic \? islamicChannel\(approval\) : communityChannel\(approval\)/)
    assert.doesNotMatch(readFileSync(join(ROOT, "lib/server/holy-days.ts"), "utf8"), /islamicChannel|ISLAMIC_/)
  })
  it("the Islamic posts are previewed and held like the rest (the timer never publishes them unapproved)", () => {
    assert.ok(plannedIslamicPosts("2026-10-23", 11 * 60).some((p) => p.kind === "ISLAMIC_JUMUAH")) // a Friday
    assert.ok(!plannedPosts("2026-10-23", 11 * 60).some((p) => channelFor(p.kind) === "islamic")) // never in the general plan
    assert.equal(takeAllowed("PENDING", "PUBLISHED", false), false)
  })
  it("the Facebook publish functions demand an approval", () => {
    const fb = readFileSync(join(ROOT, "lib/server/facebook-publisher.ts"), "utf8")
    assert.match(fb, /export function publishPhotoToFacebook\(_approval: FounderApproval,/)
    assert.match(fb, /export function publishTextToFacebook\(_approval: FounderApproval,/)
  })
  it("the timer can never publish a post the founder did not approve", () => {
    assert.equal(takeAllowed("PENDING", "PUBLISHED", false), false)
  })
  it("the 20:00 check-in and the Saturday spotlight are previewed too (no direct channel send left)", () => {
    assert.ok(plannedPosts("2026-10-17", 19 * 60 + 15).some((p) => p.kind === "EVENING"))
    assert.ok(plannedPosts("2026-10-17", 16 * 60 + 15).some((p) => p.kind === "SPOTLIGHT")) // a Saturday
    assert.ok(!plannedPosts("2026-10-16", 16 * 60 + 15).some((p) => p.kind === "SPOTLIGHT")) // a Friday
  })
})
