import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseNoticePeriod } from "@/lib/moc-fuel"

import { newPricesText, periodLine } from "./moc-fuel-sync"

describe("MoC fuel — the 11 October cycle post", () => {
  // The notice text as MoC writes it (dry run of the parser on the coming cycle).
  const period = parseNoticePeriod("សេចក្តីជូនដំណឹង៖ ស្តីពីថ្លៃលក់រាយប្រេងឥន្ធនៈនៅតាមស្ថានីយសម្រាប់ការអនុវត្ត ចាប់ពីវេលាម៉ោង ១ រសៀលថ្ងៃទី១១ ខែតុលា រហូតដល់ថ្ងៃទី២១ ខែតុលា ឆ្នាំ២០២៦")!
  it("the period is read from the notice text", () => {
    assert.deepEqual(period, { from: "2026-10-11", to: "2026-10-21" })
  })
  it("the period line, within a month and across months / years", () => {
    assert.equal(periodLine("2026-10-11", "2026-10-21"), "សម្រាប់ថ្ងៃទី ១១ ដល់ ២១ ខែតុលា ឆ្នាំ ២០២៦")
    assert.equal(periodLine("2026-10-21", "2026-11-01"), "សម្រាប់ថ្ងៃទី ២១ ខែតុលា ដល់ ០១ ខែវិច្ឆិកា ឆ្នាំ ២០២៦")
    assert.equal(periodLine("2026-12-21", "2027-01-01"), "សម្រាប់ថ្ងៃទី ២១ ខែធ្នូ ឆ្នាំ ២០២៦ ដល់ ០១ ខែមករា ឆ្នាំ ២០២៧")
  })
  it("the channel post: official header, period, EA92 / diesel (EA95 only when listed), change vs the last cycle", () => {
    const text = newPricesText({ regular: 5050, super: null, diesel: 5650, ...period }, { regular: 5150, diesel: 5650 }, 35999)
    assert.equal(
      text.split("\n").slice(0, 6).join("\n"),
      [
        "⛽ តម្លៃលក់រាយប្រេងឥន្ធនៈផ្លូវការ (ក្រសួងពាណិជ្ជកម្ម)",
        "📅 សម្រាប់ថ្ងៃទី ១១ ដល់ ២១ ខែតុលា ឆ្នាំ ២០២៦ (អនុវត្តចាប់ពីម៉ោង ១ រសៀល)",
        "",
        "• សាំងធម្មតា (EA92) ៖ ៥,០៥០ ៛/លីត្រ (▼ ១០០)",
        "• ប្រេងម៉ាស៊ូត (Diesel) ៖ ៥,៦៥០ ៛/លីត្រ",
        "",
      ].join("\n"),
    )
    assert.match(text, /t\.me\/mocnewsfeed\/35999/)
    assert.match(newPricesText({ regular: 5050, super: 5600, diesel: 5650, ...period }, null, 1), /• សាំងស៊ុបពែរ \(EA95\) ៖ ៥,៦០០ ៛\/លីត្រ/)
  })
})
