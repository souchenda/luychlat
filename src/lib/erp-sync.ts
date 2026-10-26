// SL Staff ERP → LuyChlat (founder, 26/10/2026 — Task #515, phase 1 of #511). The depot ERP (DL Staff) is the source
// of truth for DL MEAT SUPPLY's ledger: it pushes each money movement here, signed with a shared secret. Pure
// (erp-sync.test.ts): the signature check, the payload check and the category mapping; the writing is
// public.erp_sync_apply (migration 20270263000000), always into the configured business workspace.
import { createHmac, timingSafeEqual } from "node:crypto"

export const ERP_TYPES = ["income", "expense", "owner_draw"] as const
export type ErpType = (typeof ERP_TYPES)[number]
/**
 * Where the money moved (Task #516): the depot's cash box, its ABA or its ACLEDA account — each currency booked into the
 * DL wallet erp_sync_config maps it to (cash → «សាច់ប្រាក់ DL», aba → ABA DL, acleda → the DL ACLEDA accounts). A plain
 * «bank» is still accepted but maps nowhere: refused (422) rather than guessed between ABA and ACLEDA.
 */
export const ERP_METHODS = ["cash", "aba", "acleda", "bank"] as const
export type ErpMethod = (typeof ERP_METHODS)[number]

export type ErpPayload =
  | { action: "void"; reference_id: string }
  | {
      action: "create"
      reference_id: string
      type: ErpType
      amount: number
      currency: "USD" | "KHR"
      /** The business category preset in LuyChlat (inventory, delivery, payroll, sales…) — erpPreset. */
      preset: string
      /** The ERP's own word for it, kept in the note when it was not one of ours. */
      category: string
      note: string | null
      payment_method: ErpMethod
      /** YYYY-MM-DD or an ISO time with its offset; null → when it arrived. */
      date: string | null
      /**
       * The bank's own reference (Trx. ID / Hash), lower-case, for money that came through a bank: the same payment
       * already recorded by AUTOBOK or a slip is taken over, never booked twice (Task #516 — erp_sync_apply).
       */
      bank_ref: string | null
    }

/** A signed request older (or newer) than this is refused — a captured request cannot be replayed later. */
export const ERP_MAX_SKEW_MS = 5 * 60_000

/** The signature the ERP sends in «x-erp-signature»: «sha256=» + HMAC-SHA256(secret, «<timestamp>.<raw body>») in hex. */
export const erpSignature = (secret: string, timestamp: string, raw: string) => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`

export function verifyErpSignature(o: { secret: string; timestamp: string | null; raw: string; signature: string | null; now: number }): "ok" | "stale" | "bad" {
  if (!o.timestamp || !o.signature || !/^\d{10,13}$/.test(o.timestamp)) return "bad"
  // Seconds or milliseconds since 1970.
  const t = o.timestamp.length <= 10 ? Number(o.timestamp) * 1000 : Number(o.timestamp)
  if (Math.abs(o.now - t) > ERP_MAX_SKEW_MS) return "stale"
  const want = Buffer.from(erpSignature(o.secret, o.timestamp, o.raw))
  const got = Buffer.from(o.signature.trim())
  return want.length === got.length && timingSafeEqual(want, got) ? "ok" : "bad"
}

/**
 * The ERP's category → a DL MEAT SUPPLY preset. Our own preset keys pass as they are; the ERP's words (its office
 * expense categories, «stock», «transport», «salary»…) map to the nearest; anything else is «other» of its kind — never a
 * guess at a specific category (the ERP's word stays in the note).
 */
const EXPENSE_PRESETS = new Set(["inventory", "delivery", "payroll", "operating", "rent", "utilities", "marketing", "equipment", "tax", "other_expense"])
const INCOME_PRESETS = new Set(["sales", "services", "investment", "other_income"])
const ALIASES: Record<string, string> = {
  stock: "inventory",
  stock_purchase: "inventory",
  purchase: "inventory",
  purchases: "inventory",
  meat: "inventory",
  supplier: "inventory",
  transport: "delivery",
  fuel: "delivery",
  delivery: "delivery",
  taxi: "delivery",
  salary: "payroll",
  wages: "payroll",
  staff_food: "payroll",
  meal: "payroll",
  advance: "payroll",
  salary_advance: "payroll",
  stall: "operating",
  ice: "operating",
  office: "operating",
  phone: "utilities",
  electricity: "utilities",
  water: "utilities",
  repair: "equipment",
  repairs: "equipment",
  sale: "sales",
  sales: "sales",
  invoice: "sales",
  customer_payment: "sales",
}

export function erpPreset(type: ErpType, category: string): string {
  if (type === "owner_draw") return "owner_draw"
  const key = category.trim().toLowerCase().replace(/[\s-]+/g, "_")
  const own = type === "income" ? INCOME_PRESETS : EXPENSE_PRESETS
  if (own.has(key)) return key
  const alias = ALIASES[key]
  if (alias && own.has(alias)) return alias
  return type === "income" ? "other_income" : "other_expense"
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

/** The body as the ERP sent it → a checked payload, or what is wrong (answered 422 — the ERP's outbox shows it). */
export function parseErpPayload(body: unknown): { ok: true; payload: ErpPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body must be a JSON object" }
  const b = body as Record<string, unknown>
  const reference_id = str(b.reference_id, 120)
  if (!/^[\w.:#/-]{1,120}$/.test(reference_id)) return { ok: false, error: "reference_id: 1–120 letters, digits or . : # / - _" }
  const action = b.action === undefined ? "create" : b.action
  if (action === "void") return { ok: true, payload: { action: "void", reference_id } }
  if (action !== "create") return { ok: false, error: "action: create | void" }
  const type = ERP_TYPES.find((t) => t === b.type)
  if (!type) return { ok: false, error: "type: income | expense | owner_draw" }
  const currency = b.currency === "USD" || b.currency === "KHR" ? b.currency : null
  if (!currency) return { ok: false, error: "currency: USD | KHR" }
  const amount = typeof b.amount === "number" ? b.amount : typeof b.amount === "string" && /^\d+(\.\d+)?$/.test(b.amount.trim()) ? Number(b.amount) : NaN
  // Exact as the ERP recorded it (founder guardrail: amounts that are stated stay exact): riel whole, dollars to the cent.
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return { ok: false, error: "amount: a positive number" }
  // (10.1 × 100 is 1010.0000000000001 in floating point: compared with a tolerance, never ===.)
  if (currency === "KHR" ? !Number.isInteger(amount) : Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return { ok: false, error: currency === "KHR" ? "amount: whole riel" : "amount: at most 2 decimals" }
  const method = b.payment_method === undefined ? "bank" : ERP_METHODS.find((m) => m === b.payment_method)
  if (!method) return { ok: false, error: "payment_method: cash | aba | acleda" }
  const bankRef = str(b.bank_ref, 40).toLowerCase() || null
  if (bankRef && !/^[a-z0-9-]{4,40}$/.test(bankRef)) return { ok: false, error: "bank_ref: 4–40 letters, digits or -" }
  const date = str(b.date, 40) || null
  if (date && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(date)) return { ok: false, error: "date: YYYY-MM-DD or ISO 8601 with its offset" }
  const category = str(b.category, 60)
  return {
    ok: true,
    payload: { action: "create", reference_id, type, amount, currency, preset: erpPreset(type, category), category, note: str(b.note, 300) || null, payment_method: method, date, bank_ref: bankRef },
  }
}
