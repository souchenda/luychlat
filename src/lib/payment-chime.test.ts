import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { NATIVE_CHANNELS, isNativePrayerId } from "./native-prayer-plan"
import { PAYMENT_CHANNEL, PAYMENT_CHIME_URL, PAYMENT_ID_BASE, paymentChimeText, paymentFromRow, paymentNotificationId, ringKey, shouldChime, type PaymentEvent } from "./payment-chime"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const at = (iso: string) => Date.parse(iso)
const sale: PaymentEvent = { id: "e1", source: "khqr", transaction_id: "tx-1", amount: 50000, currency: "KHR", account_name: "DL MEAT SUPPLY", payer: "SOK DARA", transaction_time: "2026-10-21T03:00:00Z", created_at: "2026-10-21T03:00:20Z" }

describe("The payment chime on the phone (founder, 21/10/2026)", () => {
  it("its own Android channel: «Payment Alerts», importance max, the chime as its sound — never a prayer channel", () => {
    assert.deepEqual(PAYMENT_CHANNEL, { id: "payment_alert_v1", name: "Payment Alerts", description: "ទទួលបានប្រាក់ — KHQR", sound: "payment_received.wav", importance: 5 })
    for (const c of Object.values(NATIVE_CHANNELS)) assert.notEqual(c.id, PAYMENT_CHANNEL.id)
  })
  it("the SoundBox's words: «💰 ទទួលបានប្រាក់ +50,000 ៛» with the payer and the account", () => {
    assert.deepEqual(paymentChimeText(sale), { title: "💰 ទទួលបានប្រាក់ +50,000 ៛", body: "SOK DARA · DL MEAT SUPPLY" })
    assert.match(paymentChimeText({ ...sale, amount: 25, currency: "USD" }).title, /^💰 ទទួលបានប្រាក់ \+\$25\.00$/)
  })
  it("rings for a fresh sale once; never on /soundbox (it announces itself), never late, never twice, never when off", () => {
    const base = { enabled: true, path: "/", event: sale, seen: new Set<string>(), now: at("2026-10-21T03:00:21Z") }
    assert.equal(shouldChime(base), true)
    assert.equal(shouldChime({ ...base, enabled: false }), false)
    assert.equal(shouldChime({ ...base, path: "/soundbox" }), false)
    assert.equal(shouldChime({ ...base, path: "/wallets" }), true)
    assert.equal(shouldChime({ ...base, seen: new Set(["tx-1"]) }), false)
    // More than 10 minutes after the bank's time: never a late ring (the golden SoundBox rule).
    assert.equal(shouldChime({ ...base, event: { ...sale, created_at: "2026-10-21T03:10:30Z" } }), false)
  })
  it("notification ids from 500,000,000 — never a prayer alarm's, under 2^31, the same id for the same payment", () => {
    for (const id of ["e1", "0b7c2f1e-1234-4abc-9def-001122334455", "zzzz"]) {
      const n = paymentNotificationId(id)
      assert.ok(n >= PAYMENT_ID_BASE && n < 600_000_000 && n < 2 ** 31, `${id}: ${n}`)
      assert.equal(isNativePrayerId(n), false)
      assert.equal(paymentNotificationId(id), n)
    }
  })
  it("a realtime row: amounts from Postgres strings; anything not a real payment is ignored", () => {
    assert.deepEqual(paymentFromRow({ id: "e2", amount: "25.50", currency: "USD", payer: null, account_name: "Shop" })?.amount, 25.5)
    for (const bad of [{ id: "x", amount: "0", currency: "KHR" }, { id: "x", amount: "5", currency: "THB" }, { amount: "5", currency: "KHR" }]) assert.equal(paymentFromRow(bad), null)
  })
})

describe("Wiring (founder, 21/10/2026)", () => {
  it("the chime is our own synthesis, in the APK and for the browser — the SoundBox's tones, no third-party sound", () => {
    assert.equal(PAYMENT_CHIME_URL, "/audio/payment_received.wav")
    assert.ok(statSync(join(process.cwd(), "public/audio/payment_received.wav")).size > 50_000)
    if (existsSync(join(process.cwd(), "android"))) assert.ok(statSync(join(process.cwd(), "android/app/src/main/res/raw/payment_received.wav")).size > 50_000)
    if (existsSync(join(process.cwd(), "scripts/render-payment-chime.py"))) assert.match(read("scripts/render-payment-chime.py"), /1318\.5, 0\.02, 0\.35, 0\.3, "triangle"\), \(1975\.5, 0\.18, 0\.55, 0\.25, "triangle"\)/)
  })
  it("on every screen (the app shell); the same KHQR sales as the SoundBox — no other trigger", () => {
    assert.match(read("src/app/(app)/layout.tsx"), /<PrayerAlertScheduler \/>\n\s+<PaymentChimeListener \/>/)
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /\{ schema: "public", table: "soundbox_events", event: "INSERT" \}/)
    assert.match(l, /shouldChime\(\{ enabled: on\.current, path: path\.current \?\? "", event: e, seen: seen\.current, now: Date\.now\(\) \}\)/)
    assert.match(l, /channelId: PAYMENT_CHANNEL\.id, sound: PAYMENT_CHANNEL\.sound/)
    // The SoundBox stays isolated: its audio module is still imported by the SoundBox page alone.
    assert.doesNotMatch(l, /soundbox-audio/)
  })
  it("the switch in Settings: business members only, off by default (opt-in per device — Task #488); turning it on asks the permission and plays it once", () => {
    const s = read("src/app/(app)/settings/page.tsx")
    assert.match(s, /const business = \(useWorkspaces\(\)\.data \?\? \[\]\)\.some\(\(w\) => w\.type === "BUSINESS"\)/)
    assert.match(s, /<PushSettingsRow \/>\n\s+<PaymentChimeRow \/>/)
    assert.match(read("src/stores/prefs-store.ts"), /paymentChime: false,/)
  })
})

describe("The dual trigger — KHQR sales and confirmed income slips (founder, 21/10/2026)", () => {
  const slip: PaymentEvent = { id: "c1", source: "slip", transaction_id: "tx-9", bank: "ABA Bank", amount: 25, currency: "USD", created_at: "2026-10-21T03:00:00Z" }
  it("a confirmed slip: the same title, «វិក្កយបត្រ ABA Bank · កត់ត្រាជោគជ័យ» under it", () => {
    assert.deepEqual(paymentChimeText(slip), { title: "💰 ទទួលបានប្រាក់ +$25.00", body: "វិក្កយបត្រ ABA Bank · កត់ត្រាជោគជ័យ" })
    assert.equal(paymentChimeText({ ...slip, bank: null }).body, "វិក្កយបត្រ · កត់ត្រាជោគជ័យ")
  })
  it("a slip always rings once it is confirmed — on /soundbox too (the SoundBox never announces a slip), whatever its date", () => {
    const base = { enabled: true, path: "/soundbox", event: { ...slip, transaction_time: "2026-10-20T01:00:00Z" }, seen: new Set<string>(), now: at("2026-10-21T03:00:01Z") }
    assert.equal(shouldChime(base), true)
    assert.equal(shouldChime({ ...base, enabled: false }), false)
  })
  it("regression guard: one ring per transaction, whichever trigger came first", () => {
    const seen = new Set([ringKey({ ...sale, transaction_id: "tx-7" })])
    assert.equal(shouldChime({ enabled: true, path: "/", event: { ...slip, transaction_id: "tx-7" }, seen, now: at("2026-10-21T03:00:21Z") }), false)
    assert.equal(ringKey({ ...slip, transaction_id: null }), "slip:c1") // no transaction: the event itself
    assert.equal(paymentFromRow({ id: "c2", transaction_id: "tx-2", amount: "10", currency: "USD", bank: "Bakong" }, "slip")?.bank, "Bakong")
  })
  it("the database decides a slip chime: business INCOME only (never an expense, a transfer, a loan repayment), once, never a bank reference that already rang", () => {
    const sql = read("supabase/migrations/20270239000000_payment_chimes.sql")
    assert.match(sql, /where tx\.id = p_transaction_id\n\s+and tx\.type = 'INCOME' and tx\.debt_id is null and w\.type = 'BUSINESS';/)
    assert.match(sql, /exists \(select 1 from public\.soundbox_events e where e\.transaction_id = t\.id\)/)
    assert.match(sql, /where o\.workspace_id = t\.workspace_id and o\.bank_ref = t\.bank_ref\)/)
    assert.match(sql, /transaction_id uuid not null unique/)
    assert.match(sql, /create policy payment_chimes_member on public\.payment_chimes\n\s+for select to authenticated using \(public\.is_workspace_member\(workspace_id\)\)/)
    assert.match(sql, /alter publication supabase_realtime add table public\.payment_chimes/)
  })
  it("emitted where an income slip is confirmed: the private chat's category tap, the business group's slip and its wallet tap", () => {
    assert.match(read("src/lib/server/slip-bot.ts"), /if \(action\.kind === "INCOME"\) await emitSlipChime\(r\.tx_id, action\.slip\?\.bank\)/)
    const biz = read("src/lib/server/biz-slip-bot.ts")
    assert.match(biz, /if \(r\.kind === "INCOME"\) await emitSlipChime\(r\.tx_id, chimeBank\(r, slip\.bank\)\)/)
    assert.match(biz, /if \(r\.kind === "INCOME"\) await emitSlipChime\(r\.tx_id, chimeBank\(r\)\)/)
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /table: "soundbox_events", event: "INSERT" \}, onRow\("khqr"\)\)/)
    assert.match(l, /table: "payment_chimes", event: "INSERT" \}, onRow\("slip"\)\)/)
    assert.match(read("src/lib/server/payment-chime.ts"), /\} catch \(e\) \{/) // never fails the bot's reply
  })
})
