/**
 * A fixed / term deposit screenshot from a bank app (ACLEDA "Goal Saving", ABA Fixed Deposit…): what
 * Vision reads, the goal wallet and maturity reminder it becomes, and the bot's confirmation.
 * Pure (term-deposit.test.ts); the reading is src/lib/server/term-deposit-bot.ts.
 */
import { providerForName } from "@/lib/wallets/providers"

export type TermDeposit = {
  bank: string | null
  accountNumber: string | null
  currency: "KHR" | "USD"
  principal: number
  maturityAmount: number | null
  /** Percent per year. */
  rate: number | null
  openDate: string | null
  maturityDate: string
  payoutAccount: string | null
}

export const DEPOSIT_PROMPT = [
  "This image should be a bank app screen of a FIXED / TERM DEPOSIT or GOAL SAVING account (labels like \"Principle Amount\", \"Principal\", \"Maturity Date\", \"Maturity Amount\", \"Interest Rate\", \"Goal Saving Purposes\", \"Account Details\", ប្រាក់បញ្ញើមានកាលកំណត់).",
  "Answer JSON only:",
  '{"is_deposit": boolean, "bank": string | null, "account_number": string | null, "currency": "KHR" | "USD", "principal": number, "maturity_amount": number | null, "interest_rate": number | null, "open_date": "YYYY-MM-DD" | null, "maturity_date": "YYYY-MM-DD", "payout_account": string | null}',
  "bank: the bank whose app it is, from its logo, brand name and colours (Chip Mong Bank, ACLEDA, ABA, PRASAC, Canadia, Sathapana, Wing, Amret, J Trust, PPCBank…) — never assumed: if no bank is identifiable, null. account_number: the deposit's account number as printed. payout_account: the account the money is paid to at maturity, if shown.",
  "principal: the deposited amount (\"Principle Amount\" / \"Principal\"); maturity_amount: the amount paid at maturity; interest_rate: the yearly rate in percent (6.25 for \"6.25%\").",
  "Amounts are numbers without separators (\"37,321,570.14\" → 37321570.14). Dates as YYYY-MM-DD (\"21 Oct 2026\" → 2026-10-21; dd/mm/yyyy is day first).",
  'If it is not a deposit account screen, or the principal or maturity date is unreadable, answer {"is_deposit": false}.',
].join("\n")

const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/[,\s$៛]/g, "")) : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
const digits = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/[^\d]/g, "").slice(0, 30) || null : null)

/** The model's JSON → a deposit, or null when it isn't one / the essentials are missing or implausible. */
export function cleanTermDeposit(raw: unknown): TermDeposit | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.is_deposit !== true) return null
  const principal = num(r.principal)
  const maturityDate = date(r.maturity_date)
  if (!principal || !maturityDate) return null
  const maturityAmount = num(r.maturity_amount)
  const rate = num(r.interest_rate)
  return {
    bank: typeof r.bank === "string" && r.bank.trim() ? r.bank.trim().slice(0, 30) : null,
    accountNumber: digits(r.account_number),
    currency: r.currency === "USD" ? "USD" : "KHR",
    principal: Math.round(principal * 100) / 100,
    // A maturity amount below the principal is a misreading.
    maturityAmount: maturityAmount && maturityAmount >= principal ? Math.round(maturityAmount * 100) / 100 : null,
    rate: rate && rate < 30 ? rate : null,
    openDate: date(r.open_date),
    maturityDate,
    payoutAccount: digits(r.payout_account),
  }
}

/** The bank as the app names it everywhere (wallet providers: «Chip Mong Bank» and its logo), else as read. */
export function depositBank(bank: string | null): { label: string; icon: string } {
  const provider = providerForName(bank)
  return provider ? { label: provider.name.en, icon: provider.key } : { label: bank ?? "Bank", icon: "other" }
}

/** «Chip Mong Bank FD ***0102» — the wallet's name (the account number never in full). */
export function depositWalletName(d: Pick<TermDeposit, "bank" | "accountNumber">): string {
  return [depositBank(d.bank).label, "FD", d.accountNumber ? `***${d.accountNumber.slice(-4)}` : null].filter(Boolean).join(" ")
}

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** «Chip Mong Bank — បញ្ញើមានកាលកំណត់ (ដល់កំណត់ ២១ តុលា ២០២៦)» — the /bills reminder's title. */
export function depositBillTitle(d: Pick<TermDeposit, "bank" | "maturityDate">): string {
  const [y, m, day] = d.maturityDate.split("-").map(Number)
  return `${depositBank(d.bank).label} — បញ្ញើមានកាលកំណត់ (ដល់កំណត់ ${kmDigits(String(day))} ${KM_MONTHS[m - 1]} ${kmDigits(String(y))})`
}

/** What bot_term_deposit saves. */
export function depositPayload(d: TermDeposit) {
  return {
    bank: depositBank(d.bank).label,
    wallet_name: depositWalletName(d),
    bill_title: depositBillTitle(d),
    currency: d.currency,
    principal: d.principal,
    maturity_amount: d.maturityAmount,
    maturity_date: d.maturityDate,
    icon: depositBank(d.bank).icon,
  }
}

export const daysTo = (today: string, day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)

const money = (n: number, c: "KHR" | "USD") => (c === "KHR" ? `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}៛` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** The bot's confirmation card (account numbers masked by the chat). */
export function depositText(d: TermDeposit, today: string, workspace: string | null): string {
  const left = daysTo(today, d.maturityDate)
  const when = left > 0 ? `នៅសល់ ${left} ថ្ងៃ` : left === 0 ? "ថ្ងៃនេះ" : `ហួស ${-left} ថ្ងៃ`
  return [
    "🏦 បានកត់ត្រាប្រាក់បញ្ញើមានកាលកំណត់ (Fixed Deposit)",
    `• គណនី៖ ${depositWalletName(d)}${workspace ? ` · ${workspace}` : ""}`,
    `• ប្រាក់ដើម៖ ${money(d.principal, d.currency)}`,
    ...(d.rate ? [`• អត្រាការប្រាក់៖ ${d.rate}% ក្នុងមួយឆ្នាំ`] : []),
    ...(d.maturityAmount ? [`• ទទួលបាននៅកាលកំណត់៖ ${money(d.maturityAmount, d.currency)} (+${money(Math.round((d.maturityAmount - d.principal) * 100) / 100, d.currency)})`] : []),
    `• ថ្ងៃដល់កាលកំណត់៖ ${ddmmyyyy(d.maturityDate)} (${when})`,
    ...(d.payoutAccount ? [`• បង់ចូលគណនី៖ ***${d.payoutAccount.slice(-4)}`] : []),
    "",
    "✅ បានបង្កើតកាបូបសន្សំ (គោលដៅ = ប្រាក់ទទួលបាន) និងការរំលឹកនៅទំព័រវិក្កយបត្រ ៧ ថ្ងៃ ៣ ថ្ងៃ និង ១ ថ្ងៃមុនកាលកំណត់។",
  ].join("\n")
}
