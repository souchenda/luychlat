/**
 * Camera-first intake (founder, 12/10/2026): one «📷 ថតរូប ឬស្កេនឯកសារ» bar on the goal, wallet, loan,
 * bill and vehicle forms. A photo is read by Vision AI into the form's own fields; the person reviews
 * and corrects them before saving — nothing is saved from a photo alone. Pure readers for the new
 * kinds (bank account screen, vehicle document) and the loan detail → debt form mapping; the bill
 * form keeps its own reader (/api/bills/ocr). Pure (scan.test.ts).
 */
import type { Currency } from "@/lib/data/types"
import { detailToSchedule, type LoanDetailRead } from "@/lib/loans/loan-detail-read"
import { providerForName } from "@/lib/wallets/providers"
import type { VehicleDocType } from "@/lib/vehicle-docs"

export type ScanKind = "account" | "vehicle" | "loan"

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,\s$៛]/g, "")) : NaN
  return Number.isFinite(n) ? n : null
}
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)

// ── Bank account / savings screen ────────────────────────────────────────────────────────────

export type AccountRead = {
  /** The bank as shown, and its provider key when known (the wallet's logo), else "other". */
  bank: string | null
  icon: string
  /** The account's own name on the screen (e.g. «Kmeng Chhlat» savings). */
  accountName: string | null
  /** Digits / dashes as printed (stored like the wallet form's account number). */
  accountNo: string | null
  balance: number | null
  currency: Currency
}

export const ACCOUNT_PROMPT = [
  "This photo should be a Cambodian mobile-banking ACCOUNT screen (an account list, account details or a savings account — e.g. Chip Mong «Kmeng Chhlat», ABA, ACLEDA, Wing), in Khmer or English, light or dark.",
  "Answer only JSON for the one main account shown:",
  '{"is_account": boolean, "bank": string | null, "account_name": string | null, "account_no": string | null, "balance": number | null, "currency": "USD" | "KHR"}',
  "- bank: the bank's name as shown (logo text, app name). account_name: the account's own name or product (not the person's name).",
  "- account_no: exactly as printed (digits, spaces, dashes). balance: the available / current balance shown for that account.",
  "- Never invent a value: null when not on the screen.",
  'If it is not a bank account screen, answer {"is_account": false}.',
].join("\n")

export function cleanAccount(raw: unknown): AccountRead | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.is_account !== true) return null
  const bank = text(r.bank, 40)
  const accountNo = text(r.account_no, 40)
  const balance = num(r.balance)
  if (!bank && !accountNo && balance === null) return null
  return {
    bank,
    icon: providerForName(bank)?.key ?? "other",
    accountName: text(r.account_name, 40),
    accountNo: accountNo && /^[0-9][0-9 -]{2,29}$/.test(accountNo) ? accountNo : null,
    balance: balance !== null && balance >= 0 ? balance : null,
    currency: r.currency === "KHR" ? "KHR" : "USD",
  }
}

/** A wallet / goal name from the screen: «Chip Mong · Kmeng Chhlat», or the bank alone. */
export const accountTitle = (a: Pick<AccountRead, "bank" | "accountName">, providerName?: string | null) =>
  [providerName ?? a.bank, a.accountName].filter(Boolean).join(" · ").slice(0, 60)

// ── Vehicle document ─────────────────────────────────────────────────────────────────────────

export type VehicleRead = { docType: VehicleDocType | null; vehicle: string | null; expiresOn: string | null; provider: string | null }

export const VEHICLE_PROMPT = [
  "This photo should be a Cambodian VEHICLE DOCUMENT: a roadworthiness inspection certificate (ឆៀកឡាន / វិញ្ញាបនបត្រត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានជំនិះ), a road tax receipt (ពន្ធផ្លូវ / ពន្ធលើមធ្យោបាយដឹកជញ្ជូន), a vehicle insurance certificate (Forte, AIA…), or a registration card (កាតគ្រីឡាន).",
  "Answer only JSON:",
  '{"is_vehicle_doc": boolean, "doc_type": "INSPECTION" | "ROAD_TAX" | "INSURANCE" | "REGISTRATION" | null, "plate": string | null, "model": string | null, "expires_on": "YYYY-MM-DD" | null, "insurer": string | null}',
  "- plate: the plate number exactly as printed (e.g. 2AB-1234); model: make and model if printed (e.g. MG Marvel R).",
  "- expires_on: the validity end / next inspection / expiry date. insurer: the insurance company (insurance only).",
  "- Never invent a value. Ignore owner names and ID numbers.",
  'If it is not a vehicle document, answer {"is_vehicle_doc": false}.',
].join("\n")

export function cleanVehicle(raw: unknown): VehicleRead | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.is_vehicle_doc !== true) return null
  const type = r.doc_type === "INSPECTION" || r.doc_type === "ROAD_TAX" || r.doc_type === "INSURANCE" ? r.doc_type : null
  const plate = text(r.plate, 20)
  const model = text(r.model, 36)
  const vehicle = [model, plate].filter(Boolean).join(" · ").slice(0, 60) || null
  const expiresOn = date(r.expires_on)
  if (!vehicle && !expiresOn) return null
  return { docType: type, vehicle, expiresOn, provider: type === "INSURANCE" ? text(r.insurer, 60) : null }
}

// ── Loan detail → the debt form ──────────────────────────────────────────────────────────────

/** The debt form's loan fields from a loan-detail reading (schedule on, bank method, first due solved). */
export function loanFormFields(d: LoanDetailRead) {
  const s = detailToSchedule(d)
  return {
    party: s.lender,
    total: String(d.principal),
    currency: d.currency,
    interest: String(d.annualRate),
    interestPeriod: "YEAR" as const,
    startDate: d.openDate ?? s.firstDue,
    schedCount: String(s.months),
    schedMethod: d.method === "FLAT" ? ("FLAT" as const) : ("BANK" as const),
    schedFirst: s.firstDue,
    note: [d.account ? `កុង ${d.account}` : null, `📷 ពីរូបថត · នៅសល់ ${d.outstanding}`].filter(Boolean).join(" · "),
    installmentStated: s.installmentStated,
    paid: s.paidThrough ?? 0,
  }
}
