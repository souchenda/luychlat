import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { signupAlertText } from "./activity-alerts"
import { approvedThanks, communityBadge, submittedThanks } from "./contributor-thanks"
import * as G from "./islamic/glossary"

const ARABIC_OR_ISLAMIC = /[؀-ۿ]|Jazakallah|Barakallah|អាល់ហាំឌូ|អល់ឡោះ/

describe("Thanks to contributors, in their own community's words (founder, 19/10/2026)", () => {
  it("Islamic Mode: Alhamdulillah and Jazakallahu Khayran on sending, Barakallahu Feek once approved — the glossary's words", () => {
    assert.equal(
      submittedThanks(true),
      "អាល់ហាំឌូលិលឡាហ៍! សំណើរបស់អ្នកត្រូវបានបញ្ជូនរួចរាល់ហើយ។ យ៉ាហ្សាស្កាល់ឡាហូ ខាយរ៉ន (Jazakallahu Khayran / جَزَاكَ اللَّهُ خَيْرًا) — សូមអល់ឡោះតបស្នងនូវសេចក្ដីល្អសម្រាប់ការចូលរួមចំណែកកសាងសហគមន៍។",
    )
    assert.equal(
      approvedThanks(true, "place").message,
      "🎉 អាល់ហាំឌូលិលឡាហ៍! ទីតាំងដែលអ្នកបានផ្ដល់ជូន ត្រូវបានអនុម័តជាផ្លូវការហើយ។ បារ៉ាកាល់ឡាហូ ហ្វីក (Barakallahu Feek / بَارَكَ اللَّهُ فِيكَ) — សូមអល់ឡោះប្រទានពរជ័យ និងផលបុណ្យដ៏ច្រើនលើសលប់ដល់អ្នក!",
    )
    assert.match(approvedThanks(true, "qasidah").message, /^🎉 អាល់ហាំឌូលិលឡាហ៍! បទកសាដះដែលអ្នកបានផ្ដល់ជូន/)
    assert.ok(submittedThanks(true).includes(G.JAZAKALLAH_LABEL) && approvedThanks(true, "place").message.includes(G.BARAKALLAH_LABEL))
  })

  it("everyone else: warm formal Khmer — never an Arabic or Islamic phrase", () => {
    assert.equal(submittedThanks(false), "អរគុណច្រើនសម្រាប់ការចូលរួមចំណែក! សំណើរបស់អ្នកត្រូវបានបញ្ជូនរួចរាល់ហើយ ក្រុមការងារនឹងពិនិត្យផ្ទៀងផ្ទាត់យ៉ាងឆាប់រហ័សបំផុត។")
    assert.equal(
      approvedThanks(false, "place").message,
      "🎉 អបអរសាទរ! ទីតាំងដែលអ្នកបានផ្ដល់ជូន ត្រូវបានអនុម័ត និងដាក់ឱ្យប្រើប្រាស់ជាសាធារណៈហើយ។ ក្រុមការងារ អេប លុយឆ្លាត សូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅចំពោះការចូលរួមចំណែកដ៏មានតម្លៃរបស់អ្នក!",
    )
    for (const text of [submittedThanks(false), approvedThanks(false, "place").title, approvedThanks(false, "place").message, approvedThanks(false, "qasidah").message]) {
      assert.doesNotMatch(text, ARABIC_OR_ISLAMIC, text)
    }
  })

  it("the database picks the wording by the member's own Islamic Mode, for an approved contribution only", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270186000000_contributor_thanks_activity.sql"), "utf8")
    assert.match(sql, /islamic := coalesce\(\(select s\.enabled from public\.islamic_settings s where s\.user_id = member\), false\);/)
    assert.match(sql, /case when islamic then p_islamic_message else p_general_message end/)
    assert.match(sql, /where p\.id = p_id and p\.approved and p\.source = 'community'/)
    assert.match(sql, /where t\.id = p_id and t\.status = 'APPROVED'/)
    // The toasts follow the member's mode too.
    for (const f of ["src/components/islamic/suggest-place-sheet.tsx", "src/app/(app)/islamic/nasheed/page.tsx"]) {
      assert.match(readFileSync(join(process.cwd(), f), "utf8"), /toast\.success\(submittedThanks\(islamic\)/, f)
    }
  })

  it("the approval room's cards carry the member's community: [ 🌙 ឥស្លាម ] or [ ☀️ មហាជន ]", () => {
    assert.equal(communityBadge(true), "[ 🌙 ឥស្លាម ]")
    assert.equal(communityBadge(false), "[ ☀️ មហាជន ]")
    const card = signupAlertText({ name: "Sokha", account: "012 345 678", at: "19/10/2026 05:30 PM", islamic: true, method: "Phone", source: "Facebook", total: 1234 })
    assert.equal(
      card,
      [
        "👤 <b>សមាជិកថ្មីទើបបានចុះឈ្មោះ</b>",
        "• ឈ្មោះ/គណនី៖ Sokha · 012 345 678",
        "• ប្រភេទ៖ [ 🌙 ឥស្លាម ] (Islamic Mode)",
        "• សារស្វាគមន៍៖ « សូមអល់ឡោះ ﷻ ប្រទានពរជ័យ និងបារ៉ាកាត់ដល់ការចូលរួមរបស់បងប្អូន! 🤲 »",
        "🕒 19/10/2026 05:30 PM · Phone · ស្គាល់តាម៖ Facebook · 📊 សមាជិកសរុប 1,234 នាក់",
      ].join("\n"),
    )
    const general = signupAlertText({ name: null, account: "012 345 678", at: "—", islamic: false, method: "Phone", source: null, total: 1 })
    assert.match(general, /• ប្រភេទ៖ \[ ☀️ មហាជន \] \(General\)\n• សារស្វាគមន៍៖ « សូមស្វាគមន៍យ៉ាងកក់ក្តៅ និងថ្លែងអំណរគុណដល់ការគាំទ្ររបស់លោកអ្នក! 🙏 »/)
    assert.doesNotMatch(general, /អល់ឡោះ|<i>/) // no blessing for a general member; never italic Khmer
    assert.match(signupAlertText({ name: "<b>x", account: "a", at: "t", islamic: false, method: "m", source: null, total: 1 }), /&lt;b&gt;x/)
    const events = readFileSync(join(process.cwd(), "src/lib/server/member-events.ts"), "utf8")
    assert.match(events, /const chats = await marketingChats\(\)/) // the approval room first
    assert.match(events, /parse_mode: "HTML", disable_notification: true/) // quiet
  })
})
