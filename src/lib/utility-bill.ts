/**
 * Utility bill OCR (electricity / water: EDC, private distributors such as
 * AKISANI KOUR SROV, PPWSA): what Vision read from a paper bill, checked, and
 * the bill's title. Pure (unit-tested in utility-bill.test.ts).
 */

export type UtilityBill = {
  kind: "ELECTRICITY" | "WATER"
  provider: string | null
  customerId: string | null
  customerName: string | null
  location: string | null
  invoiceNo: string | null
  /** YYYY-MM-DD */
  dueDate: string | null
  amount: number
  currency: "KHR" | "USD"
  /** Electricity: kWh used; water: m³ used. */
  usage: number | null
  /** Price per kWh / m³ in the bill's currency. */
  rate: number | null
}

const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String("០១២៣៤៥៦៧៨៩".indexOf(d)))
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string") return null
  const n = Number(latin(v).replace(/[^\d.]/g, ""))
  return Number.isFinite(n) && latin(v).match(/\d/) ? n : null
}

/** What the vision model returned, checked. Null unless it is a utility bill with an amount. */
export function cleanUtilityBill(raw: unknown): UtilityBill | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.is_bill === false) return null
  const currency = String(r.currency ?? "KHR").toUpperCase() === "USD" ? "USD" : "KHR"
  const amountRaw = num(r.amount_due)
  if (!amountRaw || amountRaw <= 0 || amountRaw >= 1e10) return null
  const amount = currency === "KHR" ? Math.round(amountRaw) : Math.round(amountRaw * 100) / 100
  const dueRaw = typeof r.due_date === "string" ? latin(r.due_date.trim()) : ""
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) && !Number.isNaN(Date.parse(`${dueRaw}T00:00:00Z`)) ? dueRaw : null
  const usage = num(r.consumption)
  const rate = num(r.rate)
  const kind = String(r.kind ?? "").toUpperCase() === "WATER" ? "WATER" : "ELECTRICITY"
  const customerId = text(r.customer_id, 40)
  return {
    kind,
    provider: text(r.provider, 80),
    customerId: customerId ? latin(customerId) : null,
    customerName: text(r.customer_name, 60),
    location: text(r.location, 80),
    invoiceNo: text(r.invoice_no, 40),
    dueDate,
    amount,
    currency,
    usage: usage !== null && usage >= 0 && usage < 1e6 ? usage : null,
    rate: rate !== null && rate > 0 && rate < 1e5 ? rate : null,
  }
}

/** A short name for the provider: "EDC", "PPWSA", or the distributor's name without the company words. */
export function providerShort(provider: string | null, kind: UtilityBill["kind"]): string {
  const p = provider ?? ""
  if (/\bedc\b|អគ្គិសនីកម្ពុជា/i.test(p)) return "EDC"
  if (/ppwsa|ទឹកស្វយ័តក្រុងភ្នំពេញ/i.test(p)) return "PPWSA"
  const latinName = /\(([^)]+)\)/.exec(p)?.[1]?.trim()
  const khmer = p
    .replace(/\([^)]*\)/g, "")
    .replace(/ក្រុមហ៊ុន|ឯ\.ក|ឯកជន|ខូអិលធីឌី|co\.?,? ?ltd\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  return (khmer || latinName || (kind === "WATER" ? "ទឹក" : "អគ្គិសនី")).slice(0, 40)
}

/** The bill's title: "⚡ អគ្គិសនី គួរស្រូវ · ផ្ទះ 37 (3A)" (at most 80 characters). */
export function utilityBillTitle(b: Pick<UtilityBill, "provider" | "location" | "kind">): string {
  const where = (b.location ?? "").replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ") ").replace(/\s+/g, " ").trim()
  const shortWhere = where.split(" ").slice(0, 4).join(" ")
  return [providerShort(b.provider, b.kind), shortWhere].filter(Boolean).join(" · ").slice(0, 80)
}

/** The due day of the month for a monthly bill. */
export const dueDayOf = (dueDate: string | null) => (dueDate ? Number(dueDate.slice(8, 10)) : null)
