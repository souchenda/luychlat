import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

// deploy/ is not in the Docker build context: the test runs where the script exists.
const path = "deploy/autobok-watch.sh"
const present = existsSync(path)

function conflictRe(): RegExp {
  const m = readFileSync(path, "utf8").match(/^CONFLICT_RE='([^']+)'/m)
  assert.ok(m, "CONFLICT_RE is defined")
  return new RegExp(m[1], "i")
}

test("a payment amount with 409 in it is not a second AUTOBOK (false alarm 6/11/2026)", { skip: !present }, () => {
  const re = conflictRe()
  for (const line of [
    "📊 ថ្ងៃនេះ៖ 409,500៛ • 3 ប្រតិបត្តិការ",
    "🚀 [LuyChlat Webhook] Successfully forwarded 179394702751963 (ABA 26000 KHR)",
    "✅ Saved transaction #409",
    "Amount 4,409.50 USD",
  ]) assert.equal(re.test(line), false, line)
})

test("Telegram's real polling conflict is still caught", { skip: !present }, () => {
  const re = conflictRe()
  for (const line of [
    "error: [polling_error] {\"code\":\"ETELEGRAM\",\"message\":\"ETELEGRAM: 409 Conflict: terminated by other getUpdates request; make sure that only one bot instance is running\"}",
    "409: Conflict: terminated by other getUpdates request",
    "Conflict: terminated by other getUpdates request",
  ]) assert.equal(re.test(line), true, line)
})
