import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isOffTopic } from "./ai-guard"
import { parseEacNotice } from "./eac"

const newBill = `វិក្កយបត្រថ្មី
មានវិក្កយបត្រថ្មីសម្រាប់លោកអ្នក ៖ 05/10/2026
លេខកូដអតិថិជន ៖ 539-011685
ឈ្មោះអតិថិជន ៖ ស៊ូ ចិន្តា ផ្ទះ 37 ( 3A )
ទឹកប្រាក់ត្រូវទូទាត់ ៖ 692,100 ៛`

const paid = `ការបង់ប្រាក់ជោគជ័យ
លេខកូដអតិថិជន ៖ ៥៣៩-០១១៦៨៧
ឈ្មោះអតិថិជន ៖ ហាង ភីវ
ទឹកប្រាក់បានបង់ ៖ 886,900 ៛
ថ្ងៃបង់ប្រាក់ ៖ 08-10-2026`

describe("EAC notifications", () => {
  it("a new bill", () => {
    assert.deepEqual(parseEacNotice(newBill), { type: "NEW_BILL", customerId: "539-011685", customerName: "ស៊ូ ចិន្តា ផ្ទះ 37 ( 3A )", amount: 692100, billDate: "2026-10-05" })
  })
  it("a payment (Khmer digits)", () => {
    assert.deepEqual(parseEacNotice(paid), { type: "BILL_PAID", customerId: "539-011687", customerName: "ហាង ភីវ", amount: 886900, paidDate: "2026-10-08" })
  })
  it("anything else is not an EAC notice", () => {
    assert.equal(parseEacNotice("បាយថ្ងៃ 12000"), null)
    assert.equal(parseEacNotice("វិក្កយបត្រថ្មី\nលេខកូដអតិថិជន ៖ 539-011685"), null)
  })
})

describe("AI guard (layer 1)", () => {
  it("turns away what isn't about money, without a model call", () => {
    for (const q of ["សរសេររឿងនិទានមួយ", "write me a poem about the sea", "help with my python homework", "សួស្តី", "how are you?", "តើគណបក្សណាល្អ?"]) assert.equal(isOffTopic(q), true, q)
  })
  it("lets every money question through — even with an off-topic word in it", () => {
    for (const q of ["ខែនេះខ្ញុំចំណាយលើអ្វីច្រើនជាងគេ?", "how can I save more each month?", "តម្លៃមាសថ្ងៃនេះ?", "write a budget for my shop", "ថ្លៃរៀនកូនខ្ញុំគួរសន្សំប៉ុន្មាន?", "តើគួរវិនិយោគលើភាគហ៊ុនទេ?"]) assert.equal(isOffTopic(q), false, q)
  })
})
