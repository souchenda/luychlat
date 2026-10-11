/**
 * /bills in the bot: the workspace's bills — overdue, due within a week, later — with amounts and
 * paid status, and fixed deposit maturities apart (money coming in). Pure (bills-overview.test.ts);
 * the data is bot_bills_overview.
 */

export type OverviewBill = { title: string; kind: string; amount: number; currency: "KHR" | "USD"; due: string; paid_until: string | null }

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const money = (n: number, c: "KHR" | "USD") =>
  c === "KHR" ? `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}៛` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Paid for this cycle: paid within the last month and the next due not yet near (as /bills shows «✅ បង់រួច»). */
const paidNow = (b: OverviewBill, today: string) => Boolean(b.paid_until && Math.abs(days(today, b.paid_until)) <= 31 && days(today, b.due) > 3)

function when(today: string, due: string): string {
  const d = days(today, due)
  return d < 0 ? `ហួស ${-d} ថ្ងៃ` : d === 0 ? "ថ្ងៃនេះ" : d === 1 ? "ស្អែក" : `នៅសល់ ${d} ថ្ងៃ`
}

export function billsOverviewText(bills: OverviewBill[], today: string, workspace: string | null): string {
  const deposits = bills.filter((b) => b.kind === "DEPOSIT")
  const payable = bills.filter((b) => b.kind !== "DEPOSIT")
  const line = (b: OverviewBill) => `• ${b.title} — ${money(b.amount, b.currency)} · ${ddmm(b.due)} (${when(today, b.due)})${paidNow(b, today) ? " · ✅ បង់រួច" : ""}`
  const overdue = payable.filter((b) => days(today, b.due) < 0 && !paidNow(b, today))
  const soon = payable.filter((b) => days(today, b.due) >= 0 && days(today, b.due) <= 7)
  const later = payable.filter((b) => days(today, b.due) > 7)
  const out = [`🧾 វិក្កយបត្រ និងការរំលឹក${workspace ? ` · ${workspace}` : ""}`]
  if (!bills.length) {
    out.push("", "មិនទាន់មានវិក្កយបត្រទេ។ ចុច «➕ បន្ថែមវិក្កយបត្រ» ដើម្បីកំណត់ការរំលឹក។")
    return out.join("\n")
  }
  if (overdue.length) out.push("", "🔴 ហួសកំណត់", ...overdue.map(line))
  if (soon.length) out.push("", "🟠 ក្នុង ៧ ថ្ងៃខាងមុខ", ...soon.map(line))
  if (later.length) out.push("", "🗓️ ក្រោយនេះ", ...later.map(line))
  if (deposits.length)
    out.push("", "💰 ប្រាក់បញ្ញើដល់កាលកំណត់", ...deposits.map((b) => `• ${b.title} — ${money(b.amount, b.currency)} · ${ddmm(b.due)} (${when(today, b.due)})`))
  return out.join("\n")
}
