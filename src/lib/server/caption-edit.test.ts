import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("Editing a waiting post's caption by replying to its card (founder, 20/10/2026)", () => {
  const sql = read("supabase/migrations/20270237000000_post_caption_edit.sql")
  const sp = read("src/lib/server/scheduled-posts.ts")
  it("the database: the card found by its message, an approver only (as a ✅ tap), still waiting, never the market feeds; audited", () => {
    assert.match(sql, /where previews @> jsonb_build_array\(jsonb_build_object\('chat', p_chat_id, 'msg', p_message_id\)\)/)
    assert.match(sql, /actor := public\.tip_chat_super_admin\(p_actor\);\n  if actor is null then raise exception 'super admin only'/)
    assert.match(sql, /if r\.status not in \('PENDING', 'APPROVED'\) then raise exception 'not_waiting'/)
    assert.match(sql, /if r\.kind in \('BULLETIN', 'RATES', 'ISLAMIC_BULLETIN', 'FUEL', 'POSTER'\) then raise exception 'not_editable'/)
    assert.match(sql, /jsonb_build_object\('caption', clean, 'caption_by', left\(coalesce\(p_editor, ''\), 80\), 'caption_at', now\(\)\)/)
    assert.match(sql, /perform public\.audit\('POST_CAPTION_EDIT'/)
  })
  it("the webhook: a text reply to a bot message in a group is tried as a card edit first; anything else carries on", () => {
    const hook = read("src/app/api/telegram/webhook/route.ts")
    const group = hook.slice(hook.indexOf('if (message && (message.chat.type === "group" || message.chat.type === "supergroup")) {'))
    const edit = group.indexOf("await editCardByReply(message.chat.id, message.reply_to_message.message_id, message.from?.id, editor, message.text)")
    assert.ok(edit > 0 && edit < group.indexOf("await handleGroupMessage("), "before the group's other handling")
  })
  it("the card shows the new caption and who edited it; it is redrawn in place", () => {
    assert.match(sp, /const body = row\.payload\.caption \? `\$\{row\.payload\.caption\}\\n\\n\$\{editedLine\(row\)\}` : content\.body/)
    assert.match(sp, /return `✏️ កែអត្ថបទដោយ៖ 👤 \$\{row\.payload\.caption_by \|\| "—"\}/)
    assert.match(sp, /await real\(\)\.refresh\(row\)/)
  })
  it("published with the edited caption — its own poster, its channel (Islamic kept apart), the Page as usual, the footer", () => {
    const pub = sp.slice(sp.indexOf("    if (row.payload.caption) {"), sp.indexOf('    if (row.kind === "NATIONAL_DAY") {\n      // The commemoration poster'))
    assert.ok(pub.length > 0)
    assert.match(pub, /if \(nationalDay && !holidayRouteAllowed\(nationalDay, islamic \? "islamic" : "community"\)\) return ids/)
    assert.match(pub, /const \{ png \} = await this\.content\(row\)/)
    assert.match(pub, /postFooter\(islamic \? "islamic" : "community", platform\)/)
    assert.match(pub, /if \(!islamic && targets\.facebook && facebookConfig\(\)\)/) // never an Islamic post on the Page
    assert.ok(sp.indexOf("    if (row.payload.caption) {") < sp.indexOf('    if (row.kind === "NATIONAL_DAY") {\n      // The commemoration poster'))
  })
})
