import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  COOLDOWN_MS,
  evaluate,
  firing,
  hhmm,
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
  assert.match(out[0].text, /^🟠 បង មុខងារមួយមានបញ្ហា៖ ការផុសតាមម៉ោង/)
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
