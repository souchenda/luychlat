/**
 * Electricity notifications from the "EAC App Notification" bot, forwarded (or pasted)
 * to @luychlat_bot. Two kinds: a new bill (វិក្កយបត្រថ្មី) and a payment that went through
 * (ការបង់ប្រាក់ជោគជ័យ). Pure (eac.test.ts).
 */

export type EacNotice =
  | { type: "NEW_BILL"; customerId: string; customerName: string | null; amount: number; billDate: string | null }
  | { type: "BILL_PAID"; customerId: string; customerName: string | null; amount: number; paidDate: string | null }

const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String("០១២៣៤៥៦៧៨៩".indexOf(d)))

/** The value after "label ៖" (or ":") on its line. */
function field(text: string, label: string): string | null {
  const m = new RegExp(`${label}\\s*[៖:]\\s*([^\\n]+)`).exec(text)
  return m ? m[1].trim() : null
}

const riel = (v: string | null) => {
  if (!v) return null
  const n = Number(latin(v).replace(/[^\d]/g, ""))
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null
}

/** "15/10/2026", "15-10-2026", "2026-10-15" → YYYY-MM-DD (null when not a real date). */
function day(v: string | null): string | null {
  if (!v) return null
  const s = latin(v)
  const dmy = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s)
  const ymd = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const [y, m, d] = ymd ? [ymd[1], ymd[2], ymd[3]] : dmy ? [dmy[3], dmy[2].padStart(2, "0"), dmy[1].padStart(2, "0")] : []
  if (!y) return null
  const iso = `${y}-${m}-${d}`
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso
}

export function parseEacNotice(raw: string): EacNotice | null {
  const text = raw.replace(/\r/g, "")
  const customerId = field(text, "លេខកូដអតិថិជន")
  if (!customerId) return null
  const id = latin(customerId).replace(/\s+/g, "").slice(0, 40)
  const customerName = field(text, "ឈ្មោះអតិថិជន")?.slice(0, 60) ?? null
  if (/ការបង់ប្រាក់ជោគជ័យ/.test(text)) {
    const amount = riel(field(text, "ទឹកប្រាក់បានបង់"))
    return amount ? { type: "BILL_PAID", customerId: id, customerName, amount, paidDate: day(field(text, "ថ្ងៃបង់ប្រាក់")) } : null
  }
  if (/វិក្កយបត្រថ្មី/.test(text)) {
    const amount = riel(field(text, "ទឹកប្រាក់ត្រូវទូទាត់"))
    return amount ? { type: "NEW_BILL", customerId: id, customerName, amount, billDate: day(field(text, "មានវិក្កយបត្រថ្មីសម្រាប់លោកអ្នក")) } : null
  }
  return null
}
