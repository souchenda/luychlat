// GOLDEN GUARD — video, reels and humour never reach a public channel or page without the founder's tap (founder,
// 18/10/2026: «tone in comedy and religion is guarded by the founder»). Every rendered video, script and humour post
// goes to the founder's private chat first with [ ✅ ] [ 🚀 ] [ ❌ ]; silence means HOLD; only a super admin's tap on
// ✅ or 🚀 lets it out — to @LuyChlatIslamic, @LuyChlatCommunity or the Facebook Page. Nothing can bypass it in code.
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, it } from "node:test"

import { REEL_SCRIPTS, reelRenderable } from "../../src/lib/islamic/reels-scripts"
import { COMEDY_KINDS, dueAction, plannedPosts, previewButtons, takeAllowed, type PostStatus } from "../../src/lib/scheduled-posts"

const ROOT = join(process.cwd(), "src")
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, p).replace(/\\/g, "/")] : []
  })
}
const files = walk(ROOT).map((f) => ({ f, src: readFileSync(join(ROOT, f), "utf8") }))
const users = (re: RegExp) => files.filter((x) => re.test(x.src)).map((x) => x.f).sort()
const only = (found: string[], allowed: string[], what: string) =>
  assert.deepEqual(found.filter((f) => !allowed.includes(f)), [], `${what} outside the approved publisher`)

describe("GOLDEN · video and humour: the founder's private preview first, never auto-published", () => {
  it("a video, animation or album is sent only by the scheduled-post publisher (which needs a FounderApproval)", () => {
    only(users(/\bsend(Video|Animation|VideoNote|MediaGroup)\b/), ["lib/server/scheduled-posts.ts"], "a Telegram video send")
  })
  it("Facebook (videos and Reels too) only through facebook-publisher.ts, whose publish functions demand an approval", () => {
    only(users(/graph(-video)?\.facebook\.com|video_reels/), ["lib/server/facebook-publisher.ts"], "a Facebook Graph call")
    const fb = readFileSync(join(ROOT, "lib/server/facebook-publisher.ts"), "utf8")
    const publishers = [...fb.matchAll(/export (?:async )?function (publish\w*ToFacebook)\(([^)]*)\)/g)]
    assert.ok(publishers.length >= 2)
    for (const [, name, params] of publishers) assert.match(params, /^\s*_?approval: FounderApproval/, `${name} must take the founder's approval first`)
  })
  it("silence means HOLD: the timer never publishes a post the founder did not approve, and it expires unpublished", () => {
    const at = new Date(Date.parse("2026-10-20T11:30:00Z")).toISOString()
    const now = Date.parse(at)
    for (const s of ["PENDING", "PAUSED", "EXPIRED", "PUBLISHED"] as PostStatus[]) {
      assert.notEqual(dueAction(at, now + 60_000, s), "publish", s)
      assert.notEqual(dueAction(at, now + 30 * 60_000, s), "publish", s)
    }
    assert.equal(dueAction(at, now + 60_000, "PENDING"), "hold")
    assert.equal(dueAction(at, now + 91 * 60_000, "PENDING"), "expire")
  })
  it("zero bypass: only the founder's tap approves; the timer publishes only what the founder approved", () => {
    const all: PostStatus[] = ["PENDING", "APPROVED", "PUBLISHED", "PAUSED", "EXPIRED"]
    for (const from of all) {
      assert.equal(takeAllowed(from, "APPROVED", false), false, `the timer approved ${from}`)
      assert.equal(takeAllowed(from, "PUBLISHED", false), from === "APPROVED", `the timer published ${from}`)
    }
    // The database says the same, and checks the tapper is a super admin (the founder's authorized account).
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations")).sort()
    const defining = migrations.filter((m) => /function public\.bot_post_take/.test(readFileSync(join(process.cwd(), "supabase/migrations", m), "utf8")))
    const sql = readFileSync(join(process.cwd(), "supabase/migrations", defining.at(-1)!), "utf8")
    assert.match(sql, /actor := public\.tip_chat_super_admin\(p_chat_id\);\s*if actor is null then raise exception 'super admin only'/)
    assert.match(sql, /when p_status = 'PUBLISHED' then array\['APPROVED'\]/)
    // The tap's chat is what the database checks.
    const server = readFileSync(join(ROOT, "lib/server/scheduled-posts.ts"), "utf8")
    assert.match(server, /taken = await d\.take\(parsed\.id, parsed\.action === "publish" \? "PUBLISHED" : parsed\.action === "approve" \? "APPROVED" : "PAUSED", actor\)/)
  })
  it("a humour post's preview: [ ✅ យល់ព្រម ] [ 🚀 ផុសភ្លាមៗ ] [ ❌ ផ្អាក / បដិសេធ ]", () => {
    assert.ok(COMEDY_KINDS.includes("DILEMMA"))
    assert.deepEqual(previewButtons(9, "PENDING", { telegram: true, facebook: true }, "DILEMMA").map((r) => r[0].text), [
      "✅ យល់ព្រម (ផ្សាយតាមម៉ោង)",
      "🚀 ផុសភ្លាមៗ (Telegram + Facebook)",
      "❌ ផ្អាក / បដិសេធ",
    ])
    assert.equal(previewButtons(9, "PENDING", { telegram: true, facebook: true }, "MORNING")[2][0].text, "❌ ផ្អាកថ្ងៃនេះ")
    // Previewed like every post (Tuesday 18:30 → the preview from 17:45), and its text is sent only by the publisher.
    assert.ok(plannedPosts("2026-10-20", 17 * 60 + 45).some((p) => p.kind === "DILEMMA"))
    only(users(/dilemmaPostText\(/), ["lib/money-dilemmas.ts", "lib/server/scheduled-posts.ts"], "the dilemma text")
  })
  it("reels: only a script the founder approved is rendered; the reel modules cannot publish anything", () => {
    for (const s of REEL_SCRIPTS) assert.equal(reelRenderable(s), s.status === "APPROVED", s.id)
    assert.equal(reelRenderable({ ...REEL_SCRIPTS[0], status: "DRAFT" }), false)
    for (const f of ["lib/islamic/reels-scripts.ts", "lib/islamic/reels-timeline.ts", "lib/islamic/reels-audio.ts", "lib/islamic/reels-renderer.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8")
      const imports = src.match(/^import .*$/gm) ?? []
      for (const i of imports) assert.doesNotMatch(i, /lib\/server\/|channel|facebook|scheduled-posts|telegram/i, `${f}: ${i}`)
      assert.doesNotMatch(src, /\bfetch\(|sendVideo|founderApproved/, f)
    }
    // The voice service makes audio only: it imports nothing that publishes.
    const tts = readFileSync(join(ROOT, "lib/server/reels-tts.ts"), "utf8")
    for (const i of tts.match(/^import .*$/gm) ?? []) assert.doesNotMatch(i, /channel|facebook|scheduled-posts|telegram/i, i)
    assert.doesNotMatch(tts, /founderApproved|sendVideo|sendMessage/)
  })
  it("every rendered video is a DRAFT artifact: marked on every frame until approved, recorded DRAFT, published nowhere by the renderer", () => {
    const frames = readFileSync(join(ROOT, "lib/server/reels-frames.ts"), "utf8")
    for (const i of frames.match(/^import .*$/gm) ?? []) assert.doesNotMatch(i, /channel|facebook|scheduled-posts|telegram/i, i)
    assert.doesNotMatch(frames, /founderApproved|sendVideo|sendMessage|sendDocument/)
    assert.match(frames, /status: "DRAFT"/)
    assert.doesNotMatch(frames, /status: "(APPROVED|PUBLISHED)"/)
    assert.match(frames, /const approved = reelRenderable\(o\.script\)/) // the DRAFT mark unless the founder approved the script
    assert.match(frames, /if \(s\.draft\) draftMark\(ctx\)/)
    const cli = readFileSync(join(process.cwd(), "scripts/reels-render.ts"), "utf8")
    for (const i of cli.match(/^import .*$/gm) ?? []) assert.doesNotMatch(i, /channel|facebook|scheduled-posts|telegram/i, i)
  })
})

describe("GOLDEN · factual feeds on time, everything creative behind the founder's tap (founder, 19/10/2026)", () => {
  it("only the market bulletin, the evening NBC rates and the 05:30 prayer times publish without a tap — the same list in TS and SQL", async () => {
    const { AUTO_PUBLISH_KINDS } = await import("../../src/lib/scheduled-posts")
    assert.deepEqual([...AUTO_PUBLISH_KINDS].sort(), ["BULLETIN", "ISLAMIC_MORNING", "RATES"])
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations")).sort()
    const defining = migrations.filter((m) => /function public\.post_auto_publish/.test(readFileSync(join(process.cwd(), "supabase/migrations", m), "utf8")))
    const sql = readFileSync(join(process.cwd(), "supabase/migrations", defining.at(-1)!), "utf8")
    assert.match(sql, /select p_kind in \('BULLETIN', 'RATES', 'ISLAMIC_MORNING'\)/)
    for (const creative of ["MORNING", "DILEMMA", "SPOTLIGHT", "HOLIDAY", "POSTER", "FUEL", "EVENING", "HOLYDAY", "ISLAMIC_DAILY", "ISLAMIC_FAST", "ISLAMIC_JUMUAH", "ISLAMIC_NIGHT", "ISLAMIC_IFTAR", "ISLAMIC_QUIZ"])
      assert.ok(!AUTO_PUBLISH_KINDS.includes(creative as never), `${creative} must wait for the founder`)
  })
  it("no auto-published feed reaches Facebook (the Page stays behind the founder's tap)", () => {
    const sp = readFileSync(join(ROOT, "lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /if \(row\.kind === "EVENING" \|\| row\.kind === "BULLETIN" \|\| row\.kind === "RATES" \|\| row\.kind === "POSTER" \|\| row\.kind === "HOLYDAY"\) return \{ telegram, facebook: false \}/)
    assert.match(sp, /if \(islamic\) \{/) // the Islamic posts (the 05:30 one too) go to the Islamic channel only
  })
  it("the approval group: set only by a super admin, never left by the watchdog, never a public channel", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270178000000_approval_group_auto_feeds.sql"), "utf8")
    assert.match(sql, /actor := public\.tip_chat_super_admin\(p_actor\);\s*if actor is null then raise exception 'super admin only'/)
    assert.match(sql, /delete from public\.telegram_groups where chat_id = p_chat_id/)
    const guard = readFileSync(join(ROOT, "lib/server/group-guard.ts"), "utf8")
    assert.match(guard, /if \(\(await isCommunityChat\(chatId\)\) \|\| \(await isApprovalChat\(chatId\)\)\) \{\s*\/\/ Never leave/)
    const routes = readFileSync(join(ROOT, "lib/server/admin-routes.ts"), "utf8")
    assert.match(routes, /reviewChats\(\{ approval, marketing, superAdmins: \[\], isPublic/)
  })
})

describe("GOLDEN · every database function the bot calls is callable by the bot (19/10/2026 regression)", () => {
  it("each rpc(\"bot_…\") in the server code ends granted to anon — the bot's role, its key checked inside", () => {
    // The bot connects as anon; a bot_* function revoked from anon without a later grant breaks it in production
    // («permission denied for function bot_islamic_places_sync», /setapprovalgroup failing in «LCA Approval»).
    const called = new Set(files.flatMap(({ src }) => [...src.matchAll(/rpc\("(bot_\w+)"/g)].map((m) => m[1])))
    const dir = join(process.cwd(), "supabase/migrations")
    const anon = new Map<string, boolean>()
    for (const m of readdirSync(dir).sort()) {
      const sql = readFileSync(join(dir, m), "utf8")
      for (const st of sql.matchAll(/(revoke all|revoke execute|grant execute) on function public\.(bot_\w+)\([^)]*\) (?:from|to) ([^;]+);/g)) {
        if (/\banon\b|\bpublic\b/.test(st[3])) anon.set(st[2], st[1] === "grant execute" ? /\banon\b/.test(st[3]) : false)
      }
    }
    const refused = [...called].filter((fn) => anon.get(fn) === false).sort()
    assert.deepEqual(refused, [], `revoked from the bot: ${refused.join(", ")}`)
  })
})
