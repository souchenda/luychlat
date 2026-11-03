import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { parseLoginIdentifier } from "./auth-identifier"
import { BOT_SIGNUP_URL, COMMUNITY_BUTTON, contactAccount, openAppKeyboard, signinLink, signinToken, SIGNUP_BUTTON, signupKeyboard, SIGNUP_NUDGE, signupReply, SIGNIN_LINK_MINUTES, telegramName, wantsWelcome } from "./telegram-signup"

const TOKEN = "a".repeat(64)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("sign-up and sign-in through the bot (founder, 30/10/2026)", () => {
  it("a shared Cambodian number is the same account the app's phone sign-up makes", () => {
    for (const phone of ["85512345678", "+85512345678", "+855 96 123 4567"]) {
      const a = contactAccount(phone)!
      assert.ok(a, phone)
      // Exactly what typing the number on the sign-in page gives — never a second account for one number.
      assert.equal(a.email, parseLoginIdentifier(a.local)!.email, phone)
    }
    assert.deepEqual(contactAccount("85512345678"), { email: "85512345678@phone.luy.ibmserp.com", local: "012345678" })
  })

  it("any other number is refused (the phone accounts are Cambodian); a local form without 855 is never guessed", () => {
    for (const phone of ["14155550100", "66812345678", "012345678", "855012345678", "8551234", "", null]) assert.equal(contactAccount(phone), null, String(phone))
  })

  it("the one-tap link carries the token in the fragment of /login (never sent by a link preview), read back strictly", () => {
    assert.equal(signinLink(TOKEN), `https://app.luychlat.com/login#tgLogin=${TOKEN}`)
    assert.equal(signinToken(new URL(signinLink(TOKEN)).hash), TOKEN)
    assert.equal(signinToken(`#x=1&tgLogin=${TOKEN.toUpperCase()}`), TOKEN)
    for (const hash of ["", "#tgLogin=", `#tgLogin=${TOKEN}0`, "#tgLogin=abc", `#tgAuthResult=${TOKEN}`, null]) assert.equal(signinToken(hash), null, String(hash))
  })

  it("the bot's buttons: one that shares the person's own number (one-time), then «open the app»", () => {
    const k = signupKeyboard()
    assert.equal(k.keyboard.length, 1)
    assert.equal(k.keyboard[0][0].request_contact, true)
    assert.equal(k.is_persistent, true) // stays until shared: a «Cancel» never leaves them stuck (founder, 2/11/2026)
    assert.ok(!("one_time_keyboard" in k))
    assert.deepEqual(openAppKeyboard(TOKEN).inline_keyboard[0][0].url, signinLink(TOKEN))
    assert.equal(openAppKeyboard(TOKEN).inline_keyboard.length, 1)
  })

  it("a new member gets the community channel one tap away — the general one only, never @LuyChlatIslamic (founder, 2/11/2026)", () => {
    const rows = openAppKeyboard(TOKEN, { community: true }).inline_keyboard
    assert.equal(rows.length, 2) // never two buttons in a row
    assert.deepEqual(rows[1], [{ text: COMMUNITY_BUTTON, url: "https://t.me/LuyChlatCommunity" }])
    assert.ok(read("src/lib/server/poster-kit.ts").includes("t.me/LuyChlatCommunity"))
    assert.doesNotMatch(read("src/lib/telegram-signup.ts").replace(/\/\*\*[^]*?\*\//g, ""), /LuyChlatIslamic/)
    assert.match(signupReply("created"), /👥 ចូលរួមសហគមន៍/)
    assert.doesNotMatch(signupReply("signin"), /សហគមន៍/)
    assert.match(read("src/lib/server/telegram-signup.ts"), /openAppKeyboard\(r\.token, \{ community: created \}\)/)
  })

  it("someone who barely uses Telegram: /start gets the welcome, anything else a short «where to tap» (founder, 2/11/2026)", () => {
    for (const t of ["/start", "/start@luychlat_bot", "/help", " /START "]) assert.equal(wantsWelcome(t), true, t)
    for (const t of ["012 345 678", "hello", "សួស្តី", "/startx", "/bills", "", null, undefined]) assert.equal(wantsWelcome(t), false, String(t))
    assert.ok(SIGNUP_NUDGE.includes(`«${SIGNUP_BUTTON}»`))
    assert.match(SIGNUP_NUDGE, /Share/)
    assert.match(SIGNUP_NUDGE, /មិនបាច់វាយលេខទូរសព្ទទេ/)
    assert.ok(SIGNUP_NUDGE.length < 400)
    assert.doesNotMatch(SIGNUP_NUDGE, /កម្មវិធី|អែប|&|[០-៩]/)
    const hook = read("src/app/api/telegram/webhook/route.ts")
    assert.match(hook, /else if \(wantsWelcome\(opts\.text\)\) await sendWelcome\(chat\.id, opts\.name\)\r?\n\s+else await sendText\(chat\.id, SIGNUP_NUDGE, \{ reply_markup: gateKeyboard\(\) \}\)/)
  })

  it("the login page's «create an account» tab offers Google and the bot's sign-up, never the sign-in-only widget (founder, 2/11/2026)", () => {
    assert.equal(BOT_SIGNUP_URL, "https://t.me/luychlat_bot?start=signup")
    assert.equal(wantsWelcome("/start signup"), true) // the bot answers with the share button
    assert.match(read("src/app/login/page.tsx"), /signUpExtra=\{<SocialLogin disabled=\{cloudDisabled\} below signup \/>\}/)
    assert.match(read("src/components/auth/email-login.tsx"), /\{mode === "signup" && signUpExtra\}/)
    const social = read("src/components/auth/social-login.tsx")
    assert.match(social, /if \(signup\) return window\.location\.assign\(BOT_SIGNUP_URL\)\n\s+window\.location\.assign\(telegramAuthUrl/)
    assert.match(social, /\.data === true && !signup/) // no Face ID for someone new
  })

  it("a new account starts with the person's Telegram name, plain and short", () => {
    assert.equal(telegramName(" Sok ", "Dara"), "Sok Dara")
    assert.equal(telegramName("<b>Sok</b>", undefined), "bSok/b")
    assert.equal(telegramName(undefined, null), "")
    assert.equal(telegramName("x".repeat(60), "y").length, 40)
  })

  it("the bot's answers: Khmer, the brand, 0-9 digits, never the number or a balance", () => {
    for (const k of ["created", "signin", "elsewhere", "foreign", "busy"] as const) {
      const m = signupReply(k)
      assert.doesNotMatch(m, /កម្មវិធី|អែប|&|[០-៩]|\d{8,}/, k)
    }
    assert.match(signupReply("created"), /ឥតគិតថ្លៃ/)
    assert.match(signupReply("signin"), /ប្តូរពាក្យសម្ងាត់/) // a password stays optional
    assert.ok(signupReply("created").includes(`${SIGNIN_LINK_MINUTES} នាទី`))
  })

  it("the database: the link is single-use, 15 minutes, stored only hashed; a number linked to another Telegram is refused", () => {
    const sql = read("supabase/migrations/20270281000000_telegram_signup.sql")
    assert.match(sql, /now\(\) \+ interval '15 minutes'/)
    assert.equal(SIGNIN_LINK_MINUTES, 15)
    assert.match(sql, /token_hash text primary key/)
    assert.match(sql, /set used_at = now\(\)\s+where token_hash = encode\(sha256\(convert_to\(p_token, 'UTF8'\)\), 'hex'\) and used_at is null and expires_at > now\(\)/)
    assert.match(sql, /if other_chat is not null and other_chat <> p_chat_id then\s+return jsonb_build_object\('status', 'elsewhere'\)/)
    assert.match(sql, /if digits !~ '\^855\[1-9\]\[0-9\]\{7,8\}\$' then\s+return jsonb_build_object\('status', 'foreign'\)/)
    assert.match(sql, /revoke all on public\.telegram_signin_tokens from anon, authenticated/)
    for (const fn of ["bot_contact_account", "bot_signin_redeem"]) assert.match(sql, new RegExp(`function public\\.${fn}\\(p_key text[^]*?perform public\\.require_bot\\(p_key\\)`))
  })

  it("the server: only the person's own contact signs up (contact.user_id = from.id), and the session is made on the server", () => {
    const hook = read("src/app/api/telegram/webhook/route.ts")
    const own = hook.indexOf("const own = message.contact.user_id !== undefined && message.contact.user_id === message.from?.id")
    const signup = hook.indexOf("signUpByContact({")
    assert.ok(own > 0 && signup > own, "the own-number check comes first")
    // A password reset waiting in this chat still wins: its code, not a sign-in link.
    assert.ok(hook.indexOf('rpc("bot_reset_contact"') < signup)
    const route = read("src/app/api/auth/telegram/link/route.ts")
    assert.match(route, /bot_signin_redeem/)
    assert.match(route, /startSession\(r\.email/)
    assert.match(read("src/lib/server/magic-session.ts"), /await claimSingleSession\(supabase\)/) // one device at a time
  })
})
