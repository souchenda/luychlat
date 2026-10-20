import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { GATE_ALERT, gateDecision, gateKeyboard, gateMessage, isAppDeepLink, SIGNUP_URL } from "./gate"

const LINK = "0123456789abcdef0123456789ABCDEF"

describe("The bot is for «អេប លុយឆ្លាត» members only (founder, 20/10/2026)", () => {
  it("an unlinked private chat is gated — text, commands, photos, voice, buttons alike", () => {
    for (const text of ["hello", "/start", "/help", "/market", "/fuel", "coffee 2$", null, undefined])
      assert.equal(gateDecision({ chatType: "private", text, linked: false }), "gate", String(text))
  })
  it("a linked chat passes straight through to every feature", () => {
    for (const text of ["/start", "/market", "coffee 2$", null]) assert.equal(gateDecision({ chatType: "private", text, linked: true }), "pass")
  })
  it("the app's deep links pass before linking: /start <link code>, /start reset_<token>, the reset contact", () => {
    assert.equal(gateDecision({ chatType: "private", text: `/start ${LINK}`, linked: false }), "pass")
    assert.equal(gateDecision({ chatType: "private", text: `/start@luychlat_bot ${LINK}`, linked: false }), "pass")
    assert.equal(gateDecision({ chatType: "private", text: `/start reset_${LINK.toLowerCase()}`, linked: false }), "pass")
    assert.equal(gateDecision({ chatType: "private", contact: true, linked: false }), "pass")
    // Not a deep link: a short or made-up payload, or a payload with more words after it.
    for (const t of ["/start abc", "/start link_xyz", `/start ${LINK}x`, `/help ${LINK}`, `/start ${LINK} more`]) assert.equal(isAppDeepLink(t), false, t)
  })
  it("groups and channels — «LCA Approval», shared pools, business groups — are never gated", () => {
    for (const chatType of ["group", "supergroup", "channel"]) assert.equal(gateDecision({ chatType, text: "hello", linked: false }), "pass")
  })
  it("a failed lookup neither gates a member nor lets a stranger in: nothing is said, nothing is done", () => {
    assert.equal(gateDecision({ chatType: "private", text: "coffee 2$", linked: null }), "quiet")
  })
  it("the note is the founder's wording, greets by first name, and carries the free sign-up button", () => {
    const m = gateMessage("Dara")
    assert.ok(m.startsWith("ជម្រាបសួរ Dara! 🙏\n\n"))
    assert.ok(m.includes("បម្រើជូនផ្តាច់មុខសម្រាប់តែសមាជិកដែលមានគណនីនៅលើ «អេប លុយឆ្លាត» ប៉ុណ្ណោះ។"))
    assert.ok(m.includes("១. សូមចូលទៅបង្កើតគណនីឥតគិតថ្លៃលើអេប 👉 app.luychlat.com"))
    assert.ok(m.includes("២. ចូលទៅកាន់ ការកំណត់ (Settings) › ជ្រើសរើស «ភ្ជាប់ Telegram»"))
    assert.ok(m.endsWith("រីករាយស្វាគមន៍មកកាន់គ្រួសារលុយឆ្លាត! 🐰✨"))
    assert.equal(gateMessage(undefined).split("\n")[0], "ជម្រាបសួរ! 🙏")
    assert.doesNotMatch(m, /កម្មវិធី|អែប|&|\d{8,}/) // brand rules; no digits for the masker
    assert.deepEqual(gateKeyboard(), { inline_keyboard: [[{ text: "📱 បង្កើតគណនីឥតគិតថ្លៃ", url: SIGNUP_URL }]] })
    assert.equal(SIGNUP_URL, "https://app.luychlat.com")
    assert.ok(GATE_ALERT.length <= 190) // Telegram's callback alert limit
  })
  it("the webhook: gated before any private message or button is handled, after the group branch; never throws", () => {
    const hook = readFileSync(join(process.cwd(), "src/app/api/telegram/webhook/route.ts"), "utf8").replace(/\r\n/g, "\n")
    const priv = hook.indexOf('if (!message || message.chat.type !== "private") return NextResponse.json({ ok: true })')
    const gate = hook.indexOf("if (await gated(message.chat, { text: message.text, contact: Boolean(message.contact), name: message.from?.first_name })) return NextResponse.json({ ok: true })")
    assert.ok(priv > 0 && gate > priv, "after the private-chat check")
    assert.ok(gate < hook.indexOf("const duaFile: DuaIncoming | null"), "before the first private handler")
    assert.ok(hook.indexOf("await handleGroupMessage(") < priv, "groups are handled before, untouched")
    const cbStart = hook.indexOf("  if (update.callback_query) {")
    const cbGate = hook.indexOf("if (await gated(cb.message?.chat, { callbackId: cb.id })) return NextResponse.json({ ok: true })")
    assert.ok(cbStart > 0 && cbGate > cbStart && cbGate < hook.indexOf("isAtmReportCallback(update.callback_query.data)"), "buttons too")
    const fn = hook.slice(hook.indexOf("async function gated("), hook.indexOf("export async function POST"))
    assert.match(fn, /if \(!chat \|\| chat\.type !== "private"\) return false/)
    assert.match(fn, /if \(isAppDeepLink\(opts\.text\) \|\| opts\.contact\) return false/)
    assert.match(fn, /\} catch \{\n    return true/)
  })
})
