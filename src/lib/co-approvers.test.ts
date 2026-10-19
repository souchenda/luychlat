import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { approverReply, isApproverCommand, parseApproverCommand } from "./co-approvers"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sql = read("supabase/migrations/20270188000000_co_approvers.sql")

describe("Co-approvers in «LCA Approval» (founder, 19/10/2026)", () => {
  it("/addapprover [email or phone] and /removeapprover, as a reply in the group", () => {
    assert.deepEqual(parseApproverCommand("/addapprover sister@gmail.com"), { action: "add", login: "sister@gmail.com" })
    assert.deepEqual(parseApproverCommand("/addapprover@luychlat_bot 012 345 678"), { action: "add", login: "012 345 678" })
    assert.deepEqual(parseApproverCommand("/addapprover"), { action: "add", login: null })
    assert.deepEqual(parseApproverCommand("/removeapprover anything"), { action: "remove", login: null })
    assert.equal(parseApproverCommand("/addapprovers x"), null)
    assert.ok(isApproverCommand("/removeapprover") && !isApproverCommand("hello /addapprover"))
    assert.match(approverReply({ kind: "added", name: "Sreyleak", linked: true }), /^✅ Sreyleak អាចចុច \[ ✅ \] \[ 🚀 \] \[ ❌ \]/)
    assert.match(approverReply({ kind: "added", name: "Sreyleak", linked: false }), /មិនទាន់ភ្ជាប់គណនី/)
  })

  it("only a super admin adds or removes one — from a reply to that person's message, never by itself", () => {
    const hook = read("src/app/api/telegram/webhook/route.ts")
    assert.match(hook, /if \(message\.text && isApproverCommand\(message\.text\)\) \{\s*await handleApproverCommand\(message\.chat\.id, message\.from\?\.id, message\.text, message\.reply_to_message\?\.from\)/)
    const server = read("src/lib/server/co-approvers.ts")
    assert.match(server, /if \(!replyFrom\?\.id \|\| replyFrom\.is_bot\) return void \(await sendText\(chatId, approverReply\(\{ kind: "reply_needed" \}\)\)\)/)
    for (const fn of ["bot_add_approver", "bot_remove_approver"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}(`))
      assert.match(body, /actor := public\.tip_chat_super_admin\(p_actor\);\s*if actor is null then raise exception 'super admin only'/, fn)
    }
    assert.match(sql, /perform public\.audit\('APPROVER_ADDED'/)
    assert.match(sql, /perform public\.audit\('APPROVER_REMOVED'/)
  })

  it("a super admin or an active co-approver may decide; anyone else is refused; every decision is audited by name", () => {
    const fn = sql.slice(sql.indexOf("function public.tip_chat_approver("), sql.indexOf("revoke all on function public.tip_chat_approver"))
    assert.match(fn, /uid := public\.tip_chat_super_admin\(p_tg\);/)
    assert.match(fn, /from public\.content_approvers a where a\.telegram_user_id = p_tg and a\.active;/) // a removed approver is refused
    assert.match(fn, /'CO_APPROVER_DECISION' else 'FOUNDER_DECISION'/)
    assert.match(fn, /p_what \|\| ' · by ' \|\| who \|\| ' \(Telegram ' \|\| p_tg \|\| '\)'/)
    // The four decisions — posts (✅ 🚀 ❌), the daily tip, qasidah, places — ask it; each replaced exactly once.
    for (const f of ["bot_post_take", "bot_tip_action", "bot_nasheed_review", "bot_place_review"]) assert.ok(sql.includes(`'public.${f}(`), f)
    assert.match(sql, /raise exception 'co-approvers: % calls % % times'/)
    // Not widened: the approval room itself and the bot's du'a upload stay the super admin's.
    for (const f of ["bot_set_approval_chat", "bot_dua_recording_set"]) assert.ok(!sql.includes(f), f)
    // Nobody else: null → the functions' «super admin only» refusal, answered in Telegram.
    assert.match(read("src/lib/server/scheduled-posts.ts"), /super admin only/)
  })

  it("in the app, the «admin» staff role manages content too (du'a, Adhan, qasidah) — granted in Admin › Staff with 2FA", () => {
    assert.match(sql, /\('public\.dua_recording_put\(uuid,text,text,text,text\)', \$x\$a\.role = 'super_admin'\$x\$, \$x\$a\.role in \('super_admin', 'admin'\)\$x\$\)/)
    assert.match(sql, /create policy nasheed_tracks_write on public\.nasheed_tracks for all to authenticated\s+using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\);/)
    assert.doesNotMatch(sql, /insert into public\.app_admins/) // the role itself is given only in Admin › Staff (2FA required)
  })
})
