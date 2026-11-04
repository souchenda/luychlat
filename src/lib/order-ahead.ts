import type { Currency } from "./data/types"
import { roundMoney } from "./money"

/**
 * Order-ahead «កម្មង់ទុកមុន» (founder, 4/11/2026 — docs/order-ahead.md): the customer's cart, the pickup times offered,
 * the statuses and what is checked before an order is sent. The server prices the order again from the menu
 * (public.order_create) — what is computed here is only what the customer sees. Pure (order-ahead.test.ts).
 */
export type MenuOption = { name: string; choices: string[] }
export type MenuItem = { id: string; name: string; description: string | null; price: number; currency: Currency; photo_path: string | null; options: MenuOption[] }
export type CartLine = { key: string; id: string; qty: number; choices: Record<string, string> }
export type OrderState = "PENDING_PAYMENT" | "PAID" | "ACCEPTED" | "READY" | "PICKED_UP" | "CANCELLED"

/** One line per item and choice set: the same coffee with other sugar is another line. */
export const lineKey = (id: string, choices: Record<string, string>) =>
  `${id}|${Object.keys(choices)
    .sort()
    .map((k) => `${k}=${choices[k]}`)
    .join(",")}`

export function addToCart(cart: CartLine[], id: string, choices: Record<string, string>, qty = 1): CartLine[] {
  const key = lineKey(id, choices)
  const found = cart.find((l) => l.key === key)
  if (found) return cart.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
  return [...cart, { key, id, qty: Math.min(20, qty), choices }]
}

export const setQty = (cart: CartLine[], key: string, qty: number): CartLine[] =>
  qty <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, qty: Math.min(20, qty) } : l))

/** The cart's total in its one currency; null when empty or when items of two currencies were mixed. */
export function cartTotal(cart: CartLine[], menu: MenuItem[]): { total: number; currency: Currency } | null {
  let currency: Currency | null = null
  let total = 0
  for (const l of cart) {
    const item = menu.find((m) => m.id === l.id)
    if (!item) continue
    if (currency && currency !== item.currency) return null
    currency = item.currency
    total += item.price * l.qty
  }
  return currency ? { total: roundMoney(total, currency), currency } : null
}

/** A dish's options: the first choice of each until the customer picks another. */
export const defaultChoices = (item: Pick<MenuItem, "options">): Record<string, string> =>
  Object.fromEntries(item.options.filter((o) => o.choices.length).map((o) => [o.name, o.choices[0]]))

/**
 * The pickup times: from now plus the shop's lead time, rounded up to the next 5 minutes, every 5 minutes for the next
 * 2 hours (Cambodian clock, «07:45»). ISO for the server, a label for the button.
 */
export function pickupSlots(now: number, leadMinutes: number, count = 24): { iso: string; label: string }[] {
  const step = 5 * 60_000
  const first = Math.ceil((now + leadMinutes * 60_000) / step) * step
  return Array.from({ length: count }, (_, i) => {
    const at = first + i * step
    return { iso: new Date(at).toISOString(), label: new Date(at + 7 * 3_600_000).toISOString().slice(11, 16) }
  })
}

/** A Cambodian phone number as typed: 8–16 digits, an optional +, spaces allowed («012 345 678», «+855 12 345 678»). */
export const validPhone = (phone: string) => /^\+?[0-9 ]{8,16}$/.test(phone.trim()) && phone.replace(/\D/g, "").length >= 8

/** The steps the customer sees, in order; a cancelled order has none. */
export const ORDER_STEPS: OrderState[] = ["PENDING_PAYMENT", "PAID", "ACCEPTED", "READY", "PICKED_UP"]

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  PENDING_PAYMENT: "រង់ចាំការបង់ប្រាក់ · Waiting for payment",
  PAID: "បានបង់ — ហាងនឹងទទួល · Paid",
  ACCEPTED: "កំពុងរៀបចំ · Preparing",
  READY: "រួចរាល់ — មកយកបាន · Ready for pickup",
  PICKED_UP: "បានយករួច · Picked up",
  CANCELLED: "បានបោះបង់ · Cancelled",
}

/** The shop's next step for an order on the board, or null when there is none. */
export function nextStep(state: OrderState): OrderState | null {
  switch (state) {
    case "PENDING_PAYMENT":
      return "PAID"
    case "PAID":
      return "ACCEPTED"
    case "ACCEPTED":
      return "READY"
    case "READY":
      return "PICKED_UP"
    default:
      return null
  }
}

/** A public link name from the shop's name: «DL Meat Supply» → «dl-meat-supply» (Latin letters, digits, dashes). */
export function slugFrom(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
}

export const validSlug = (slug: string) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)

/** «ស្ករ: 0%, 50%, 100%» per line → options (the menu editor's one text box). */
export function parseOptions(text: string): MenuOption[] {
  return text
    .split("\n")
    .map((line) => line.split(/[:：]/))
    .filter((p) => p.length === 2 && p[0].trim())
    .map(([name, rest]) => ({ name: name.trim().slice(0, 30), choices: rest.split(/[,，]/).map((c) => c.trim().slice(0, 30)).filter(Boolean).slice(0, 6) }))
    .filter((o) => o.choices.length > 0)
    .slice(0, 5)
}

export const optionsText = (options: MenuOption[]) => options.map((o) => `${o.name}: ${o.choices.join(", ")}`).join("\n")
