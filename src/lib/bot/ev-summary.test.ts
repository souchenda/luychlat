import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { homeChargeText, homeCost, publicChargeSummary } from "./ev-summary"

describe("EV charging — instant cost and month to date", () => {
  it("home: 45.2 kWh at the bill's 730៛/kWh is 32,996៛ → 33,000៛ (nearest 100៛); the month adds up", () => {
    assert.equal(homeCost(45.2, 730), 33000)
    const text = homeChargeText({ kwh: 45.2, rate: 730, mtdKwh: 102.1, mtdCount: 3, khrPerUsd: 4060 })
    assert.equal(
      text,
      [
        "⚡ សាកឡាននៅផ្ទះ 45.2 kWh បានកត់ត្រា!",
        "💵 ថ្លៃភ្លើងលើកនេះ៖ 33,000 ៛ (≈ $8.13)",
        "   (គណនាតាមថ្លៃភ្លើង 730៛/kWh)",
        "",
        "📊 សរុបសាកឡាននៅផ្ទះខែនេះ៖",
        "• ថាមពលសរុប៖ 102.1 kWh",
        "• ថ្លៃភ្លើងសរុប៖ 74,500 ៛ (≈ $18.35) • 3 ដង",
        "(ចំណាំ៖ មិនកាត់លុយចេញពីកាបូបទេ ព្រោះរាប់ក្នុងថ្លៃភ្លើងផ្ទះស្រាប់)",
      ].join("\n"),
    )
  })
  it("no rate known yet: the 730៛ default; a photo says so", () => {
    const text = homeChargeText({ kwh: 10, rate: 0, mtdKwh: 10, mtdCount: 1, khrPerUsd: 4000, photo: true })
    assert.match(text, /\(ភ្ជាប់ជាមួយរូបភាពភស្តុតាង\)/)
    assert.match(text, /7,300 ៛ \(≈ \$1\.83\)/)
  })
  it("public: with numbers on, the month's vehicle energy and the EV wallet", () => {
    const text = publicChargeSummary({ amount: 8.5, currency: "USD" }, { numbers: true, publicUsd: 20.5, homeKwh: 102.1, rate: 730, khrPerUsd: 4060, evBalance: 41.5 })
    assert.match(text, /🔌 សាកឡាននៅក្រៅលើកនេះ៖ \$8\.50/)
    assert.match(text, /💳 សមតុល្យសល់ក្នុងកាបូបសាកឡាន៖ \$41\.50/)
    assert.match(text, /• សាកនៅក្រៅ៖ \$20\.50/)
    assert.match(text, /• សាកនៅផ្ទះ៖ 102\.1 kWh \(≈ \$18\.35\)/)
    assert.match(text, /• សរុប៖ \$38\.85/)
  })
  it("public: without numbers opted in, no totals and no balance in chat", () => {
    const text = publicChargeSummary({ amount: 8.5, currency: "USD" }, { numbers: false, publicUsd: 20.5, homeKwh: 102.1, rate: 730, khrPerUsd: 4060, evBalance: 41.5 })
    assert.doesNotMatch(text, /41\.50|20\.50|សរុប៖/)
    assert.match(text, /102\.1 kWh/)
  })
})
