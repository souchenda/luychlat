import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { codeLabel, isDuplicate, selectedCode, sortCodes, type KhqrCode } from "./khqr-codes"

const code = (id: string, bank: KhqrCode["bank_code"], currency: KhqrCode["currency"], isDefault = false, created = "2026-10-11T00:00:00Z"): KhqrCode => ({
  id,
  workspace_id: "ws",
  wallet_id: null,
  bank_code: bank,
  currency,
  merchant_name: "DL MEAT SUPPLY",
  khqr_payload: `000201${id}`,
  image_path: null,
  is_default: isDefault,
  created_at: created,
})

describe("multi-bank KHQR — the list and the SoundBox switcher", () => {
  const codes = [code("wing", "WING", "KHR"), code("aba-khr", "ABA", "KHR"), code("acleda", "ACLEDA", "KHR", true), code("aba-usd", "ABA", "USD")]

  it("labels: bank and currency", () => {
    assert.equal(codeLabel(codes[3]), "🔵 ABA ($)")
    assert.equal(codeLabel(codes[2]), "🟡 ACLEDA (៛)")
    assert.equal(codeLabel(codes[0]), "🟢 Wing (៛)")
  })
  it("the default first, then ABA $ / ABA ៛ / ACLEDA / Wing", () => {
    assert.deepEqual(sortCodes(codes).map((c) => c.id), ["acleda", "aba-usd", "aba-khr", "wing"])
  })
  it("the SoundBox opens on the default; a tap switches at once; a deleted choice falls back to the default", () => {
    assert.equal(selectedCode(codes, null)?.id, "acleda")
    assert.equal(selectedCode(codes, "aba-usd")?.id, "aba-usd")
    assert.equal(selectedCode(codes, "gone")?.id, "acleda")
    // No default marked (e.g. while it changes): the first in order.
    assert.equal(selectedCode(codes.map((c) => ({ ...c, is_default: false })), null)?.id, "aba-usd")
    assert.equal(selectedCode([], null), null)
  })
  it("the same QR twice is refused", () => {
    assert.ok(isDuplicate(codes, "000201wing"))
    assert.ok(!isDuplicate(codes, "000201other"))
  })
})
