import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { test } from "node:test"

// Founder, 6/11/2026 — the Supabase Disk IO warning on the Free plan: fewer database calls from the every-minute scheduler.
const read = (p: string) => readFileSync(p, "utf8")

test("a daily job asks the database once a day per process, not every minute", () => {
  const claim = read("src/lib/server/claim-daily.ts")
  assert.match(claim, /if \(answered\.has\(key\)\) return \{ data: false \}/)
  assert.match(claim, /if \(error \|\| typeof data !== "boolean"\) return \{ data: null \}/) // an error is asked again
  // Every server module but the two that release and retry a claim (festival posters, the morning push) uses it.
  const direct = readdirSync("src/lib/server")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "claim-daily.ts")
    .filter((f) => read(`src/lib/server/${f}`).includes('"bot_claim_daily"'))
  assert.deepEqual(direct.sort(), ["festival-poster.ts", "scheduled-posts.ts"])
})

test("the event log cleans up on one call in fifty; prayer subscribers every 10 minutes; group sweep every 10 passes", () => {
  const sql = read("supabase/migrations/20270296000000_log_event_light.sql")
  assert.match(sql, /if random\(\) < 0\.02 then\s+delete from public\.server_events/)
  const dispatch = read("src/lib/server/bot-dispatch.ts")
  assert.match(dispatch, /const SUBSCRIBERS_TTL_MS = 10 \* 60_000/)
  assert.match(dispatch, /if \(passes % 10 === 0\) await groupSweepTick\(\)/)
})
