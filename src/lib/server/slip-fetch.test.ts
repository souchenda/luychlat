import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

// Founder, 6/11/2026: an ACLEDA «Transaction QR to» slip got «can't read this» at 07:00 with no «slips» line in the log —
// the one silent path was a photo Telegram did not hand over. It is now logged with why and read again later.
const slipBot = readFileSync("src/lib/server/slip-bot.ts", "utf8")
const tgBot = readFileSync("src/lib/server/telegram-bot.ts", "utf8")

test("a photo not fetched from Telegram is logged and retried, never «unreadable»", () => {
  const read = slipBot.slice(slipBot.indexOf("export async function readSlip("), slipBot.indexOf("export async function readSlipImage("))
  assert.match(read, /telegramFile\(fileId, \(w\) => \(why = w\)\)/)
  assert.match(read, /logEvent\("warn", "slips", `Slip photo not fetched from Telegram: \$\{why\}`/)
  assert.match(read, /if \(!file\) \{[\s\S]*?return \{ error: "busy" \}/)
  assert.doesNotMatch(read, /if \(!file\) return \{ error: "unreadable" \}/)
})

test("telegramFile says why it failed", () => {
  const fn = tgBot.slice(tgBot.indexOf("export async function telegramFile("))
  for (const why of ["getFile failed", "file over 10 MB", "download HTTP", "download timed out", "download failed"]) assert.ok(fn.includes(why), why)
})
