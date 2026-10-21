import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  ALLOWED_UPDATES,
  blockedPhrase,
  floodTracker,
  FLOOD_WINDOW_MS,
  guardVerdict,
  isAllowedLink,
  isPositiveReaction,
  linksIn,
  MUTE_MS,
  POSITIVE_REACTIONS,
  reactionDrift,
  reactionFixText,
} from "./channel-guard"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const emoji = (...e: string[]) => e.map((x) => ({ type: "emoji", emoji: x }))

describe("Channel reactions — the positive list (founder, 21/10/2026)", () => {
  it("the list is the founder's five, ❤ with or without its variation selector", () => {
    assert.deepEqual([...POSITIVE_REACTIONS], ["👍", "❤️", "🔥", "👏", "🙏"])
    assert.ok(isPositiveReaction("❤") && isPositiveReaction("❤️") && isPositiveReaction("🙏"))
    for (const bad of ["💩", "🤮", "👎", "🤡", "🖕"]) assert.equal(isPositiveReaction(bad), false, bad)
  })
  it("the check: exactly the list is ok; every emoji allowed, reactions off, extra or missing ones are not", () => {
    assert.deepEqual(reactionDrift(emoji("👍", "❤", "🔥", "👏", "🙏")), { ok: true, state: "list", extra: [], missing: [] })
    assert.equal(reactionDrift(undefined).state, "all") // omitted = every emoji, 💩 included
    assert.deepEqual(reactionDrift([]), { ok: false, state: "off", extra: [], missing: [...POSITIVE_REACTIONS] })
    assert.deepEqual(reactionDrift(emoji("👍", "❤", "🔥", "👏", "🙏", "💩")).extra, ["💩"])
    assert.deepEqual(reactionDrift(emoji("👍", "🔥")).missing, ["❤️", "👏", "🙏"])
  })
  it("the founder's note says what is wrong and how to fix it in Telegram — the bot cannot (no Bot API method)", () => {
    const t = reactionFixText("@LuyChlatCommunity", reactionDrift(undefined))
    assert.match(t, /^🛡️ ប្រតិកម្មក្នុង @LuyChlatCommunity មិនត្រូវតាមបញ្ជី\nបច្ចុប្បន្ន៖ អនុញ្ញាតគ្រប់ប្រតិកម្ម/)
    assert.match(t, /Reactions › Some reactions/)
    assert.match(t, /៣\. ជ្រើសតែ 👍 ❤️ 🔥 👏 🙏 › Save/)
    const guard = read("src/lib/server/channel-guard.ts")
    assert.doesNotMatch(guard, /setChatAvailableReactions/) // not in the Bot API (10.3) — never called
  })
})

describe("Discussion-group links (founder, 21/10/2026)", () => {
  it("allowed: the app, the brand's channels and the bot", () => {
    for (const ok of ["app.luychlat.com", "https://app.luychlat.com/bills", "https://app.luychlat.com/LuyChlat.apk", "t.me/LuyChlatCommunity", "https://t.me/LuyChlatIslamic", "t.me/luychlat_bot?start=abc"])
      assert.ok(isAllowedLink(ok), ok)
  })
  it("blocked: shorteners, scam domains, Telegram invites and other channels, hidden text links", () => {
    for (const bad of ["bit.ly/3xYz", "https://crypto-win.io/join", "www.casino-kh.com", "t.me/+AbCdEf123", "t.me/freeusdt", "http://luychlat.com.scam.io", "app.luychlat.co"])
      assert.equal(isAllowedLink(bad), false, bad)
    const text = "Join now bit.ly/3xYz or www.casino-kh.com!"
    assert.deepEqual(linksIn(text), ["bit.ly/3xYz", "www.casino-kh.com"])
    assert.deepEqual(linksIn("ចុចទីនេះ", [{ type: "text_link", offset: 0, length: 8, url: "https://scam.vip/x" }]), ["https://scam.vip/x"])
  })
  it("not links: money, times, weights and ordinary Khmer", () => {
    for (const plain of ["ចំណាយ 5.50$ ថ្ងៃនេះ", "ម៉ោង 10.30 ព្រឹក", "សាច់ 1.5kg", "Mr.Kim បានសងបំណុលហើយ", "@LuyChlatCommunity ល្អណាស់"]) assert.deepEqual(linksIn(plain), [], plain)
  })
  it("abuse: scam phrases and profanity, whole words only — an honest comment about gambling stays", () => {
    assert.equal(blockedPhrase("Guaranteed PROFIT every day"), "guaranteed profit")
    assert.equal(blockedPhrase("ចំណេញធានា ១០០%"), "ចំណេញធានា")
    assert.equal(blockedPhrase("what the fuck"), "fuck")
    for (const ok of ["ខ្ញុំឈប់ភ្នាល់ហើយ សន្សំវិញ", "shiitake mushrooms", "a classic budget", "Scunthorpe"]) assert.equal(blockedPhrase(ok), null, ok)
  })
})

describe("The discussion-group verdict and the flood rule (founder, 21/10/2026)", () => {
  const member = { from: { id: 5, is_bot: false } }
  it("an outside link or an abusive phrase is deleted; a clean comment and the brand's links stay", () => {
    assert.deepEqual(guardVerdict({ ...member, text: "earn fast bit.ly/x" }, false), { action: "delete", reason: "link", detail: "bit.ly/x" })
    assert.deepEqual(guardVerdict({ ...member, text: "double your money now" }, false), { action: "delete", reason: "abuse", detail: "double your money" })
    assert.deepEqual(guardVerdict({ ...member, caption: "photo", caption_entities: [{ type: "text_link", offset: 0, length: 5, url: "https://x.top" }] }, false).action, "delete")
    assert.deepEqual(guardVerdict({ ...member, text: "អរគុណ! ទាញយកនៅ app.luychlat.com" }, false), { action: "allow" })
  })
  it("never touched: the channel's own forwards, the group's admins, bots (and anonymous admins)", () => {
    assert.deepEqual(guardVerdict({ ...member, text: "bit.ly/x", is_automatic_forward: true }, false), { action: "allow" })
    assert.deepEqual(guardVerdict({ ...member, text: "bit.ly/x" }, true), { action: "allow" })
    assert.deepEqual(guardVerdict({ from: { id: 1087968824, is_bot: true }, text: "bit.ly/x" }, false), { action: "allow" })
  })
  it("a second deletion within 10 minutes mutes the sender for 24 hours; another chat or a later time does not count", () => {
    const f = floodTracker()
    assert.equal(f.strike(-100, 5, 0), false)
    assert.equal(f.strike(-200, 5, 1000), false) // another group
    assert.equal(f.strike(-100, 5, FLOOD_WINDOW_MS - 1), true)
    assert.equal(f.strike(-100, 6, FLOOD_WINDOW_MS + 10), false) // another member
    const g = floodTracker()
    g.strike(-100, 7, 0)
    assert.equal(g.strike(-100, 7, FLOOD_WINDOW_MS + 1), false) // outside the window
    assert.equal(MUTE_MS, 24 * 3_600_000)
  })
})

describe("Wiring: only the channels' discussion groups, nothing else (founder, 21/10/2026)", () => {
  it("the webhook guards a discussion group first; edits and reactions reach the guard only", () => {
    const hook = read("src/app/api/telegram/webhook/route.ts")
    const group = hook.slice(hook.indexOf('if (message && (message.chat.type === "group" || message.chat.type === "supergroup")) {'))
    assert.ok(group.indexOf("if (await guardDiscussionMessage(message)) return NextResponse.json({ ok: true })") < group.indexOf("isApproverCommand"))
    assert.match(hook, /if \(update\.message_reaction\) \{\n {4}await guardReaction\(update\.message_reaction\)\n {4}return NextResponse\.json\(\{ ok: true \}\)/)
    assert.match(hook, /if \(e && \(e\.chat\.type === "group" \|\| e\.chat\.type === "supergroup"\)\) await guardDiscussionMessage\(e\)/)
    const guard = read("src/lib/server/channel-guard.ts")
    assert.match(guard, /if \(!\(await isDiscussionGroup\(m\.chat\.id\)\)\) return false/) // every other group untouched
    assert.match(guard, /if \(!\(await isDiscussionGroup\(u\.chat\.id\)\)\) return/)
  })
  it("the bot never leaves a discussion group (the 10-minute pool sweep) — it is one of the channels' chats", () => {
    const gg = read("src/lib/server/group-guard.ts")
    assert.match(gg, /return \(await publicChannels\(\)\)\.flatMap\(\(c\) => \[c\.id, \.\.\.\(c\.linkedChatId \? \[c\.linkedChatId\] : \[\]\)\]\)/)
    assert.match(gg, /if \(\(await isCommunityChat\(chatId\)\) \|\| \(await isApprovalChat\(chatId\)\)\) \{\n {6}\/\/ Never leave/)
  })
  it("the webhook subscribes to edits and reactions — the same list in the deploy script and /admin's activation", () => {
    assert.deepEqual([...ALLOWED_UPDATES], ["message", "edited_message", "callback_query", "my_chat_member", "message_reaction"])
    assert.match(read("src/app/api/telegram/activate/route.ts"), /allowed_updates: \[\.\.\.ALLOWED_UPDATES\]/)
    if (existsSync(join(process.cwd(), "deploy/bot-activate.sh")))
      assert.ok(read("deploy/bot-activate.sh").includes(`allowed_updates: ${JSON.stringify([...ALLOWED_UPDATES]).replace(/,/g, ", ")} })`))
  })
  it("the morning reaction check: once a day from 09:00, the founder told only when a channel differs, the count logged", () => {
    const guard = read("src/lib/server/channel-guard.ts")
    assert.match(guard, /p_job: "reaction-audit", p_day: now\.day/)
    assert.match(guard, /for \(const chat of await founderChats\(\)\)/)
    assert.match(guard, /sent to \$\{sent\} chat\(s\)/)
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await reactionAuditTick\(\)/)
  })
})
