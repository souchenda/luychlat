/**
 * The notification centre's feed for the active workspace — its own alerts (bills, loan installments,
 * family activity), its recent money in and out, and the day's tips — each tagged for the filter
 * tabs [ទាំងអស់ | 💵 ប្រតិបត្តិការ | 🔔 វិក្កយបត្រ | 💡 គន្លឹះ]. Everything comes from the active
 * workspace only (a business never shows personal money, and the other way round). Pure
 * (notification-feed.test.ts).
 */

export type FeedFilter = "all" | "money" | "bills" | "tips"
export type FeedKind = "money" | "bills" | "tips"

export type FeedTransaction = {
  id: string
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  amount: number
  currency: "KHR" | "USD"
  note: string | null
  transaction_date: string
  created_at: string
  wallet_name: string | null
  category_name: string | null
}

/** «ACLEDA 386***6262» → «ACLEDA •••• 6262» (a wallet's account, never in full). */
export const walletShort = (name: string | null) => (name ? name.replace(/\d{2,4}[*•]{2,}(\d{3,4})\b/, "•••• $1") : null)

/** The payer of a KHQR sale from its note («KHQR ពី SOU CHENDA (*298) (Ref: …)» → SOU CHENDA). */
export function payerOf(note: string | null): string | null {
  const m = note?.match(/KHQR ពី (.+?)(?:\s*\(\*\d+\))?\s*\(Ref:/)
  return m?.[1]?.trim() || null
}

const amountText = (sign: "+" | "-", amount: number, currency: "KHR" | "USD", hidden: boolean) =>
  hidden
    ? `${sign}${currency === "KHR" ? "*****៛" : "$*****"}`
    : currency === "KHR"
      ? `${sign}${Math.round(amount).toLocaleString("en-US")}៛`
      : `${sign}$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * A transaction as a notification line: «+8,000៛ ទទួលបានប្រាក់ពី SOU CHENDA (ACLEDA •••• 6262)»,
 * «-50,000៛ បានទូទាត់ ថ្លៃទំនិញ (ABA DL KHR)». Transfers between own wallets are not money in or out.
 */
export function transactionLine(t: FeedTransaction, hidden: boolean): { title: string; body: string } | null {
  if (t.type === "TRANSFER") return null
  const wallet = walletShort(t.wallet_name)
  if (t.type === "INCOME") {
    const payer = payerOf(t.note)
    return {
      title: `${amountText("+", t.amount, t.currency, hidden)} ${payer ? `ទទួលបានប្រាក់ពី ${payer}` : "ទទួលបានប្រាក់"}${wallet ? ` (${wallet})` : ""}`,
      body: payer ? (t.category_name ?? "") : [t.category_name, t.note].filter(Boolean).join(" · "),
    }
  }
  const what = t.note?.trim() || t.category_name || ""
  return { title: `${amountText("-", t.amount, t.currency, hidden)} បានទូទាត់${what ? ` ${what}` : ""}${wallet ? ` (${wallet})` : ""}`, body: what && t.category_name && what !== t.category_name ? t.category_name : "" }
}

/** An alert's tab: bills and dues (bills, loan installments, debts) → bills; family activity → money. */
export const notificationKind = (n: { type: string; debt_id: string | null; bill_id?: string | null }): FeedKind => (n.type === "ACTIVITY" ? "money" : "bills")

export const inFilter = (kind: FeedKind, filter: FeedFilter) => filter === "all" || filter === kind

/** The recent window of money shown in the bell. */
export const MONEY_WINDOW_DAYS = 3
