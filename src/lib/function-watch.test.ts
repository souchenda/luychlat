import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  COOLDOWN_MS,
  evaluate,
  firing,
  hhmm,
  loud,
  mayRestart,
  rosterText,
  missedJobs,
  missedText,
  MAX_ALERTS_PER_HOUR,
  newState,
  normalize,
  quietHour,
  ruleOf,
  schedulerState,
  STALL_MS,
  type WatchEvent,
} from "./function-watch"

const MIN = 60_000
// 6/11/2026 07:00 Cambodia = 00:00 UTC.
const T0 = Date.UTC(2026, 10, 6, 0, 0)
const ev = (min: number, level: WatchEvent["level"], source: string, message: string): WatchEvent => ({ at: T0 + min * MIN, level, source, message })

test("an error alerts at once; info and the machine watchdog never", () => {
  const s = newState()
  assert.equal(evaluate([ev(0, "info", "slips", "Slip read by Groq"), ev(0, "warn", "watchdog", "Alert: cpu")], T0, s).length, 0)
  const out = evaluate([ev(0, "error", "scheduled-posts", "post #35007 failed: Bad Request")], T0 + MIN, s)
  assert.equal(out.length, 1)
  assert.equal(out[0].kind, "alert")
  assert.match(out[0].text, /^🟡 បង មុខងារមួយមានបញ្ហា៖ ការផុសតាមម៉ោង/)
  assert.equal(out[0].loud, false)
  assert.match(out[0].text, /ម៉ោង 07:00/)
})

test("the 6/11 case: three slip photos not fetched in an hour alert; one does not", () => {
  const one = [ev(0, "warn", "slips", "Slip photo not fetched from Telegram: getFile failed")]
  assert.equal(firing(one, T0).length, 0)
  const three = [...one, ev(10, "warn", "slips", "Slip photo not fetched from Telegram: download timed out"), ev(40, "warn", "slips", "Slip not accepted (Gemini): not a bank receipt")]
  const f = firing(three, T0 + 41 * MIN)
  assert.equal(f.length, 1)
  assert.equal(f[0].rule.id, "slips")
  assert.equal(f[0].count, 3)
  // Out of the hour: no longer counted.
  assert.equal(firing(three, T0 + 75 * MIN).length, 0)
})

test("repeats of one error are one fault; it is not sent again within the cooldown, and recovers after 30 quiet minutes", () => {
  const s = newState()
  const a = [ev(0, "error", "market", "NBC fetch failed: HTTP 503")]
  assert.equal(evaluate(a, T0, s).length, 1)
  const b = [...a, ev(5, "error", "market", "NBC fetch failed: HTTP 504")]
  assert.equal(normalize(a[0].message), normalize(b[1].message))
  assert.equal(evaluate(b, T0 + 6 * MIN, s).length, 0)
  // Still happening after the cooldown: reminded once.
  const c = [...b, ev(31, "error", "market", "NBC fetch failed: HTTP 503")]
  const again = evaluate(c, T0 + 31 * MIN + COOLDOWN_MS / 30, s)
  assert.equal(again.filter((m) => m.kind === "alert").length, 1)
  // 30 minutes without a new one: «ល្អវិញ».
  const ok = evaluate(c, T0 + 62 * MIN, s)
  assert.deepEqual(ok.map((m) => m.kind), ["recovered"])
  assert.match(ok[0].text, /^🟢 បង អត្រាប្តូរប្រាក់ និងមាស ល្អវិញហើយ/)
})

test("never more than 6 alerts an hour — the rest in one line", () => {
  const s = newState()
  const many = Array.from({ length: 9 }, (_, i) => ev(0, "error", `src${i}`, "boom"))
  const out = evaluate(many, T0, s)
  assert.equal(out.filter((m) => m.kind === "alert").length, MAX_ALERTS_PER_HOUR)
  assert.equal(out.filter((m) => m.kind === "capped").length, 1)
  assert.match(out.at(-1)!.text, /មានបញ្ហា 3 ទៀត/)
})

test("ten warnings of any source in 30 minutes; ten security events", () => {
  const warns = Array.from({ length: 10 }, (_, i) => ev(i, "warn", "erp-sync", `retry ${i}`))
  assert.equal(firing(warns.slice(0, 9), T0 + 10 * MIN).length, 0)
  assert.equal(firing(warns, T0 + 10 * MIN).length, 1)
  assert.equal(ruleOf(ev(0, "security", "webhook", "bad secret"))?.id, "security")
  assert.equal(ruleOf(ev(0, "warn", "function-watch", "x")), null)
})

test("the scheduler's dead-man switch: stuck when a pass runs 10 minutes, stalled when none finished for 10", () => {
  assert.equal(schedulerState({ bootAt: T0, passStart: T0, passEnd: T0 + 1000 }, T0 + 5 * MIN), "ok")
  assert.equal(schedulerState({ bootAt: T0, passStart: T0 + MIN, passEnd: T0 }, T0 + MIN + STALL_MS + 1), "stuck")
  assert.equal(schedulerState({ bootAt: T0, passStart: null, passEnd: null }, T0 + STALL_MS + 1), "stalled")
  assert.equal(schedulerState({ bootAt: T0, passStart: null, passEnd: null }, T0 + 2 * MIN), "ok")
})

test("Cambodia time, 0-9 digits; quiet from 23:00 to 06:59", () => {
  assert.equal(hhmm(T0), "07:00")
  assert.equal(quietHour(T0 - MIN), true)
  assert.equal(quietHour(T0), false)
  assert.equal(quietHour(Date.UTC(2026, 10, 6, 16, 0)), true)
})

test("wired: every event feeds the watch; its own timer; the health body; the founder's chats with the count reached", () => {
  const events = readFileSync("src/lib/server/events.ts", "utf8")
  assert.match(events, /export function logEvent[\s\S]{0,200}noteEvent\(level, source, message\)\n\s+if \(!opts\.fold\)/)
  const dispatch = readFileSync("src/lib/server/bot-dispatch.ts", "utf8")
  assert.match(dispatch, /passStarted\(\)\n\s+try \{/)
  assert.match(dispatch, /finally \{\n\s+running = false\n\s+passEnded\(\)/)
  assert.match(dispatch, /setInterval\(ifActive\(\(\) => functionWatchTick\(\)\), 60_000\)/)
  const health = readFileSync("src/app/api/health/route.ts", "utf8")
  assert.match(health, /status: scheduler === "ok" \? "ok" : "degraded"/)
  const watch = readFileSync("src/lib/server/function-watch.ts", "utf8")
  assert.match(watch, /founderChats\(\)/)
  assert.match(watch, /maskNumbers\(text\)/)
  assert.match(watch, /→ \$\{reached\} chat\(s\)/)
})

test("the day's work: a job past its deadline with nothing logged alerts once; done, before the deadline, or after a deploy — never", () => {
  // Friday 6/11/2026.
  const at = (hm: string) => Date.parse(`2026-11-06T${hm}:00+07:00`)
  const boot = at("01:00")
  const seen = new Set<string>()
  assert.deepEqual(missedJobs([], at("05:49"), boot, seen).map((x) => x.id), [])
  assert.deepEqual(missedJobs([], at("05:51"), boot, seen).map((x) => x.id), ["prayer-times"])
  const prayed: WatchEvent = { at: at("05:30"), level: "info", source: "scheduled-posts", message: "ISLAMIC_MORNING 2026-11-06 published (auto) · Telegram 812 · Facebook —" }
  assert.deepEqual(missedJobs([prayed], at("05:51"), boot, seen).map((x) => x.id), [])
  // A deploy at 06:00: the feed is new, so nothing before its window is judged.
  assert.deepEqual(missedJobs([], at("10:50"), at("09:00"), seen).map((x) => x.id), [])
  // The bulletin: published, or held for lack of today's NBC rate — both are «done».
  const held: WatchEvent = { at: at("10:00"), level: "warn", source: "bulletin", message: "Bulletins held 2026-11-06: no NBC rate for today by 10:00 (latest 2026-11-05) — founder told in 1 chat(s)" }
  assert.ok(!missedJobs([prayed, held], at("10:50"), boot, seen).some((x) => x.id === "bulletin"))
  assert.ok(missedJobs([prayed], at("10:50"), boot, seen).some((x) => x.id === "bulletin"))
  // Saturday: no bulletin is expected.
  assert.ok(!missedJobs([], Date.parse("2026-11-07T10:50:00+07:00"), boot, seen).some((x) => x.id === "bulletin"))
  // The nightly report must have reached a chat.
  const none: WatchEvent = { at: at("23:30"), level: "warn", source: "nightly-report", message: "Nightly report 2026-11-06 (1 part(s)) sent to 0 chat(s)" }
  const one: WatchEvent = { ...none, level: "info", message: "Nightly report 2026-11-06 (1 part(s)) sent to 1 chat(s)" }
  assert.ok(missedJobs([prayed, held, none], at("23:46"), boot, seen).some((x) => x.id === "nightly-report"))
  assert.ok(!missedJobs([prayed, held, one], at("23:46"), boot, seen).some((x) => x.id === "nightly-report"))
  // Once reported, not again that day.
  seen.add("prayer-times|2026-11-06")
  assert.ok(!missedJobs([], at("12:00"), boot, seen).some((x) => x.id === "prayer-times"))
  assert.match(missedText(missedJobs([], at("12:00"), boot, new Set())[0]), /^🟡 បង ម៉ោងសឡាត 05:30 .*មិនទាន់ចេញទេ \(គួរចេញមុនម៉ោង 05:50\)/)
})

test("every silent failure path the 6/11 audit found now logs its reason", () => {
  const has = (p: string, re: RegExp) => assert.match(readFileSync(p, "utf8"), re, p)
  for (const p of ["account-bot", "loan-detail-bot", "loan-schedule-bot", "term-deposit-bot", "bill-bot"]) has(`src/lib/server/${p}.ts`, /telegramFile\(fileId, \(w\) => \(why = w\)\)[\s\S]{0,120}logEvent\("warn"/)
  has("src/lib/server/slip-bot.ts", /logEvent\("error", "slips", `Slip not proposed/)
  has("src/lib/server/bank-alert-bot.ts", /logEvent\("error", "bank-alert", `Bank alert not saved/)
  has("src/lib/server/bot-commands.ts", /Voice note not fetched from Telegram: HTTP/)
  has("src/lib/server/invoice-bot.ts", /Invoice not created/)
  has("src/app/api/soundbox/feed/route.ts", /SoundBox feed not read/)
  has("src/app/api/advisor/route.ts", /AI advisor \(our key\)/)
})

test("how loud: money coming in rings (🔴); everything else is silent (🟡)", () => {
  const s = newState()
  const pay = [0, 5, 10].map((m) => ev(m, "warn", "khqr", "AUTOBOK push rejected: bad signature"))
  const out = evaluate(pay, T0 + 11 * MIN, s)
  assert.equal(out.length, 1)
  assert.equal(out[0].loud, true)
  assert.match(out[0].text, /^🔴 បង មុខងារមួយមានបញ្ហា៖ ការទទួលប្រាក់ KHQR \/ AUTOBOK/)
  const [err] = firing([ev(0, "error", "soundbox", "boom")], T0)
  assert.equal(loud(err), true)
  const [other] = firing([ev(0, "error", "bills", "boom")], T0)
  assert.equal(loud(other), false)
})

test("the AI quota: five 429s in an hour from any feature are one fault, told early", () => {
  const hits = [ev(0, "warn", "slips", "Slip read: Gemini gemini-3.5-flash HTTP 429 · gemini-flash-latest HTTP 429"), ev(5, "warn", "voice", "Voice: HTTP 429"), ev(9, "warn", "scan", "HTTP 429"), ev(12, "warn", "ai", "RESOURCE_EXHAUSTED"), ev(20, "warn", "bills", "quota exceeded")]
  const f = firing(hits, T0 + 21 * MIN)
  assert.equal(f.length, 1)
  assert.equal(f[0].key, "ai-quota")
  const out = evaluate(hits, T0 + 21 * MIN, newState())
  assert.match(out[0].text, /AI \(Gemini\) ជិតអស់ quota/)
  assert.equal(out[0].loud, false)
})

test("self-repair first: twice an hour the app restarts itself; the third time the founder is told", () => {
  assert.equal(mayRestart([], T0), true)
  assert.equal(mayRestart([T0 - 10 * MIN], T0), true)
  assert.equal(mayRestart([T0 - 10 * MIN, T0 - 5 * MIN], T0), false)
  assert.equal(mayRestart([T0 - 70 * MIN, T0 - 65 * MIN], T0), true)
  assert.equal(STALL_MS, 15 * MIN)
  const watch = readFileSync("src/lib/server/function-watch.ts", "utf8")
  assert.match(watch, /if \(mayRestart\(h\.restarts, now\)\) \{[\s\S]{0,400}process\.exit\(1\)/)
  assert.match(watch, /send\(schedulerText\(s, since\), now, true\)/)
  assert.match(readFileSync("docker-compose.yml", "utf8"), /restart: unless-stopped/)
})

test("the admin roster: every change rings, emails masked by the database", () => {
  const text = rosterText([
    { change: "added", email: "so***@gmail.com", role: "super_admin", was: null },
    { change: "removed", email: "da***@gmail.com", role: null, was: "admin" },
    { change: "role", email: "ch***@gmail.com", role: "admin", was: "support" },
  ])
  assert.match(text, /^🔴 បង សិទ្ធិ Admin ត្រូវបានផ្លាស់ប្តូរ៖\n• បន្ថែម so\*\*\*@gmail\.com ជា super_admin\n• ដក da\*\*\*@gmail\.com \(admin\) ចេញ\n• ch\*\*\*@gmail\.com៖ support → admin/)
  const sql = readFileSync("supabase/migrations/20270295000000_admin_roster_watch.sql", "utf8")
  assert.match(sql, /perform public\.require_bot\(p_key\)/)
  assert.match(sql, /left\(u\.email::text, 2\) \|\| '\*\*\*'/)
  assert.match(sql, /alter table public\.admin_roster_seen enable row level security/)
  assert.doesNotMatch(sql, /public.app_settings/)
})

test("the Droplet repairs itself: certbot renew before the SSL warning, old images at 80% disk, a monthly restore test", () => {
  const watch = readFileSync("deploy/landing-watch.sh", "utf8")
  assert.ok(watch.indexOf("certbot renew --quiet") < watch.indexOf("⚠️ វិញ្ញាបនបត្រ SSL ជិតផុតកំណត់"))
  assert.match(watch, /-ge 80 \] && flock -n \/tmp\/luysmart-deploy\.lock true[\s\S]{0,200}docker image prune -af --filter "until=72h"/)
  const backup = readFileSync("deploy/db-backup.sh", "utf8")
  assert.match(backup, /restore-test\)/)
  assert.match(backup, /\$\(date \+%d\)" = "01" \]; then sh "\$0" restore-test/)
  assert.match(backup, /docker rm -f "\$name"/)
  assert.doesNotMatch(backup.slice(backup.indexOf("restore_test()"), backup.indexOf("case \"${1:-}\"")), /DATABASE_URL/)
})
