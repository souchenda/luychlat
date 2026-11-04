import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { addToCart, cartTotal, defaultChoices, lineKey, nextStep, optionsText, parseOptions, pickupSlots, setQty, slugFrom, validPhone, validSlug, type MenuItem } from "./order-ahead"

const latte: MenuItem = { id: "latte", name: "Latte", description: null, price: 2.5, currency: "USD", photo_path: null, options: [{ name: "ស្ករ", choices: ["50%", "0%", "100%"] }, { name: "ទំហំ", choices: ["M", "L"] }] }
const tea: MenuItem = { id: "tea", name: "តែទឹកដោះគោ", description: null, price: 1.75, currency: "USD", photo_path: null, options: [] }
const bai: MenuItem = { id: "bai", name: "បាយសាច់ជ្រូក", description: null, price: 8000, currency: "KHR", photo_path: null, options: [] }

describe("Order-ahead — the cart, the pickup times and the steps (founder, 4/11/2026)", () => {
  it("one line per item and choices; the same choices add up (at most 20); 0 removes the line", () => {
    let cart = addToCart([], "latte", { ស្ករ: "50%", ទំហំ: "M" })
    cart = addToCart(cart, "latte", { ទំហំ: "M", ស្ករ: "50%" }) // the same, in another order
    cart = addToCart(cart, "latte", { ស្ករ: "0%", ទំហំ: "M" })
    assert.equal(cart.length, 2)
    assert.equal(cart[0].qty, 2)
    assert.equal(lineKey("x", { b: "2", a: "1" }), "x|a=1,b=2")
    assert.equal(setQty(cart, cart[0].key, 99)[0].qty, 20)
    assert.equal(setQty(cart, cart[0].key, 0).length, 1)
    assert.deepEqual(defaultChoices(latte), { ស្ករ: "50%", ទំហំ: "M" })
  })

  it("the total in one currency, to the cent; two currencies mixed → null (the server refuses it too)", () => {
    const cart = addToCart(addToCart([], "latte", {}, 2), "tea", {})
    assert.deepEqual(cartTotal(cart, [latte, tea]), { total: 6.75, currency: "USD" })
    assert.equal(cartTotal(addToCart(cart, "bai", {}), [latte, tea, bai]), null)
    assert.equal(cartTotal([], [latte]), null)
  })

  it("pickup times: now + the lead time, up to the next 5 minutes, every 5 minutes, on the Cambodian clock", () => {
    const now = Date.parse("2026-11-04T00:41:00Z") // 07:41 in Phnom Penh
    const slots = pickupSlots(now, 15, 3)
    assert.deepEqual(slots.map((s) => s.label), ["08:00", "08:05", "08:10"])
    assert.equal(slots[0].iso, "2026-11-04T01:00:00.000Z")
  })

  it("the customer's details: a phone of 8+ digits; a public link name from the shop's name", () => {
    assert.ok(validPhone("012 345 678"))
    assert.ok(validPhone("+855 12 345 678"))
    assert.ok(!validPhone("1234"))
    assert.ok(!validPhone("abc12345678"))
    assert.equal(slugFrom("DL Meat Supply!"), "dl-meat-supply")
    assert.equal(slugFrom("Café Noir"), "cafe-noir")
    assert.ok(validSlug("cafe-noir"))
    assert.ok(!validSlug("-x"))
    assert.ok(!validSlug("ហាង"))
  })

  it("the board's next step; the options typed as text and back", () => {
    assert.equal(nextStep("PENDING_PAYMENT"), "PAID")
    assert.equal(nextStep("READY"), "PICKED_UP")
    assert.equal(nextStep("PICKED_UP"), null)
    assert.equal(nextStep("CANCELLED"), null)
    const opts = parseOptions("ស្ករ: 0%, 50%, 100%\nទំហំ：M，L\nbroken line\nទឹកកក:")
    assert.deepEqual(opts, [{ name: "ស្ករ", choices: ["0%", "50%", "100%"] }, { name: "ទំហំ", choices: ["M", "L"] }])
    assert.equal(optionsText(opts), "ស្ករ: 0%, 50%, 100%\nទំហំ: M, L")
  })
})

describe("wired — the public pages, the routes and the shop's board", () => {
  it("no sign-in for customers, rate-limited routes, prices from the menu, the KHQR with the amount only while unpaid", async () => {
    const { readFileSync } = await import("node:fs")
    const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n")
    const create = read("src/app/api/order/[slug]/route.ts")
    assert.match(create, /guardRequest\(request, \{ name: "order-create", limit: 6, windowMs: 60_000/)
    assert.match(create, /rpc\("order_create"/)
    assert.doesNotMatch(create, /p_total|price:/) // the client never sends a price
    assert.match(create, /told in \$\{reached\} of \$\{owners\.length\} chat/) // the owner told, counted
    const status = read("src/app/api/order/status/[token]/route.ts")
    assert.match(status, /if \(!\/\^\[0-9a-f\]\{32\}\$\/\.test\(token\)\)/)
    assert.match(status, /r\.order\.state === "PENDING_PAYMENT" && r\.khqr \? khqrWithAmount\(r\.khqr, Number\(r\.order\.total\)\) : null/)
    for (const p of ["src/app/s/[slug]/page.tsx", "src/app/o/[token]/page.tsx"]) assert.match(read(p), /robots: \{ index: false, follow: false \}/)
    const board = read("src/components/order/order-board.tsx")
    assert.match(board, /if \(!loading && !isUltra\)/) // ULTRA only, the database refuses customers otherwise
    assert.match(read("supabase/migrations/20270291000000_order_ahead.sql"), /public\.bot_tier\(w\.user_id\) = 'ULTRA' and public\.feature_allowed_for\('order_ahead', w\.user_id\)/)
  })
})
