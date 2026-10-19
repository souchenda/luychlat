import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { parseApproverIds } from "../co-approvers"
import { placeThanks } from "../contributor-thanks"
import { handlePlaceReviewCallback, type ReviewDeps } from "./place-alerts"

const PLACE = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const GROUP = -5578121916
const FOUNDER = 111111111
const SISTER = 222222222
const STRANGER = 999999999
const YERNY_CHAT = 333333333

/** A dry run: the database and Telegram are fakes that record every call. */
function fake(o: { approvers?: number[]; review?: "approved" | "done" | "rejected"; submitter?: { islamic: boolean; chat_id: number | null } | null; dmFails?: boolean } = {}) {
  const calls: { method: string; payload: Record<string, unknown> }[] = []
  const rpcs: { fn: string; args: Record<string, unknown> }[] = []
  const approvers = o.approvers ?? [FOUNDER, SISTER]
  const deps: ReviewDeps = {
    rpc: async (fn, args) => {
      rpcs.push({ fn, args })
      if (fn === "bot_place_review") {
        if (!approvers.includes(args.p_actor as number)) return { data: null, error: { message: "super admin only" } }
        return { data: { status: args.p_approve ? (o.review ?? "approved") : "rejected", name: "Surau", province: "កំពត" }, error: null }
      }
      if (fn === "bot_contributor_thank") return { data: o.submitter === undefined ? { islamic: true, chat_id: YERNY_CHAT } : o.submitter, error: null }
      return { data: null, error: null }
    },
    tg: async (method, payload) => {
      calls.push({ method, payload })
      return method === "sendMessage" && o.dmFails ? { ok: false, description: "Forbidden: bot was blocked by the user" } : { ok: true }
    },
    log: () => {},
  }
  const tap = (from: number, data = `plr:a:${PLACE}`) =>
    handlePlaceReviewCallback({ id: "cb1", data, from: { id: from, first_name: from === SISTER ? "Sreyleak" : "Chenda" }, message: { message_id: 77, text: "🔔 សំណើបន្ថែមទីតាំងថ្មី…\n📍 ឈ្មោះ៖ Surau", chat: { id: GROUP, type: "supergroup" } } }, deps)
  return { calls, rpcs, tap }
}

describe("Approving a place in «LCA Approval» — dry run (founder, 19/10/2026)", () => {
  it("✅ → the database, a private thank-you to the submitter, the toast, and the card with who approved and the thanks' status", async () => {
    const f = fake()
    await f.tap(FOUNDER)
    assert.deepEqual(f.rpcs[0], { fn: "bot_place_review", args: { p_id: PLACE, p_approve: true, p_actor: FOUNDER } })
    assert.equal(f.rpcs[1].fn, "bot_contributor_thank")
    const dm = f.calls.find((c) => c.method === "sendMessage")!
    assert.equal(dm.payload.chat_id, YERNY_CHAT)
    assert.equal(dm.payload.text, placeThanks(true, "Surau").html)
    assert.equal(dm.payload.parse_mode, "HTML")
    const toast = f.calls.find((c) => c.method === "answerCallbackQuery")!
    assert.equal(toast.payload.text, "✅ បានអនុម័ត និងផ្ញើសារអរគុណរួចរាល់!")
    assert.equal(toast.payload.show_alert, false)
    const card = f.calls.find((c) => c.method === "editMessageText")!
    assert.match(card.payload.text as string, /^✅ <b>បានអនុម័តរួចរាល់<\/b>\n👤 ដោយ៖ Chenda\n💌 ស្ថានភាពសារអរគុណ៖ ✅ បានផ្ញើទៅអ្នកស្នើសុំតាម Telegram\n\n🔔 សំណើបន្ថែមទីតាំងថ្មី…/)
    assert.match(card.payload.text as string, /✅ បានអនុម័តជោគជ័យ — ទីតាំង Surau \(កំពត\)/)
    assert.deepEqual(card.payload.reply_markup, { inline_keyboard: [] }) // never decided twice
  })

  it("the founder's sister (TELEGRAM_APPROVER_IDS) may approve; a stranger in the group is refused and nothing happens", async () => {
    const sister = fake()
    await sister.tap(SISTER)
    assert.match(sister.calls.find((c) => c.method === "editMessageText")!.payload.text as string, /👤 ដោយ៖ Sreyleak/)
    const stranger = fake()
    await stranger.tap(STRANGER)
    assert.deepEqual(stranger.rpcs.map((r) => r.fn), ["bot_place_review"])
    assert.deepEqual(stranger.calls.map((c) => c.method), ["answerCallbackQuery"])
    assert.equal(stranger.calls[0].payload.show_alert, true)
  })

  it("no linked Telegram, or a blocked bot: still approved, the in-app notice says thanks, the card says so", async () => {
    const unlinked = fake({ submitter: { islamic: false, chat_id: null } })
    await unlinked.tap(FOUNDER)
    assert.ok(!unlinked.calls.some((c) => c.method === "sendMessage"))
    assert.match(unlinked.calls.find((c) => c.method === "editMessageText")!.payload.text as string, /💌 ស្ថានភាពសារអរគុណ៖ 🔔 អ្នកស្នើសុំមិនទាន់ភ្ជាប់ Telegram/)
    const blocked = fake({ dmFails: true })
    await blocked.tap(FOUNDER)
    assert.match(blocked.calls.find((c) => c.method === "editMessageText")!.payload.text as string, /⚠️ ផ្ញើតាម Telegram មិនបាន/)
  })

  it("❌ rejects without any thanks; an already-approved place is not thanked twice", async () => {
    const reject = fake()
    await reject.tap(FOUNDER, `plr:r:${PLACE}`)
    assert.ok(!reject.rpcs.some((r) => r.fn === "bot_contributor_thank"))
    assert.match(reject.calls.find((c) => c.method === "editMessageText")!.payload.text as string, /^❌ <b>បានបដិសេធ<\/b>/)
    const again = fake({ review: "done" })
    await again.tap(FOUNDER)
    assert.ok(!again.rpcs.some((r) => r.fn === "bot_contributor_thank"))
  })

  it("the thank-you: the founder's words naming the place; Islamic blessings only in Islamic Mode", () => {
    const islamic = placeThanks(true, "Surau")
    assert.match(islamic.html, /^🕌 <b>សារពី អេប លុយឆ្លាត<\/b>\n\n« យ៉ាហ្សាស្កាល់ឡាហូ ខាយរ៉ន \(Jazakallahu Khayran\) បងប្អូន! ទីតាំង <b>Surau<\/b>/)
    assert.match(islamic.html, /សូមអល់ឡោះ ﷻ ប្រទានពរជ័យ សេចក្តីសុខ និងបារ៉ាកាត់/)
    const general = placeThanks(false, "<script>")
    assert.match(general.html, /^✨ <b>សារពី អេប លុយឆ្លាត<\/b>\n\n« អរគុណច្រើនសម្រាប់ការចូលរួមចំណែក! ទីតាំង <b>&lt;script&gt;<\/b>/)
    assert.doesNotMatch(general.plain, /អល់ឡោះ|Jazakallah|[؀-ۿﷰ-﷿]/)
  })

  it("TELEGRAM_APPROVER_IDS: comma-separated ids, synced at start, reaching the container", () => {
    assert.deepEqual(parseApproverIds("111111111, 222222222;x, 111111111"), [111111111, 222222222])
    assert.deepEqual(parseApproverIds(undefined), [])
    assert.match(readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8"), /TELEGRAM_APPROVER_IDS: \$\{TELEGRAM_APPROVER_IDS:-\}/)
    assert.match(readFileSync(join(process.cwd(), "src/lib/server/bot-dispatch.ts"), "utf8"), /setTimeout\(ifActive\(\(\) => syncEnvApprovers\(\)\), 10_000\)/)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270189000000_env_approvers.sql"), "utf8")
    assert.match(sql, /where a\.source = 'env' and a\.active and not \(a\.telegram_user_id = any/) // only env ids are switched off
  })
})

describe("Every approved suggestion thanks its member once (founder, 19/10/2026)", () => {
  it("approved in the app or on the founder's word: the dispatcher thanks it; a tap marks it thanked; the Kampot surau is thanked", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270190000000_place_thanks_flag.sql"), "utf8")
    assert.match(sql, /update public\.islamic_places set thanked = true\s+where approved and not thanked and id <> 'ce93c64c-3436-4fd5-aae6-a0477e7842e8';/)
    assert.match(sql, /'set approved = true, notified = true, thanked = true where id = p_id'/)
    assert.match(sql, /where q\.approved and not q\.thanked and q\.source = 'community' and q\.created_by is not null/)
    assert.match(readFileSync(join(process.cwd(), "src/lib/server/bot-dispatch.ts"), "utf8"), /await flushPlaceThanks\(\)/)
  })
})
