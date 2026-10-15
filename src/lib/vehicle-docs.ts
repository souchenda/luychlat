/**
 * Vehicle documents (Personal workspace only): ឆៀកឡាន, ពន្ធផ្លូវ, ធានារ៉ាប់រងយានយន្ត — expiry, status
 * and the reminder days, as the database's run_vehicle_doc_alerts() decides them. Pure
 * (vehicle-docs.test.ts).
 */
import type { Currency } from "@/lib/data/types"

export type VehicleDocType = "INSPECTION" | "ROAD_TAX" | "INSURANCE"
export const VEHICLE_DOC_TYPES: VehicleDocType[] = ["INSPECTION", "ROAD_TAX", "INSURANCE"]

export type VehicleDoc = {
  id: string
  workspace_id: string
  vehicle: string
  doc_type: VehicleDocType
  provider: string | null
  expires_on: string
  cost: number | null
  currency: Currency
  remind_days: number[]
  notes: string | null
}

/** D-30, D-15, D-7 (the founder's intervals). */
export const DEFAULT_REMIND_DAYS = [30, 15, 7]
/** The reminder choices in the form, and one toggled on/off (kept largest first, as stored). */
export const REMIND_CHOICES = [30, 15, 7] as const
export function toggleRemindDay(days: readonly number[], day: number): number[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day]
  return [...new Set(next)].sort((a, b) => b - a)
}

/** "Expiring soon" from 30 days before. */
export const SOON_DAYS = 30

/** Typical cost, as a hint in the form (the person enters what they actually pay). */
export const COST_HINT: Record<VehicleDocType, { currency: Currency; text: string }> = {
  INSPECTION: { currency: "USD", text: "~ $15–$25" },
  ROAD_TAX: { currency: "KHR", text: "~ ៛" },
  INSURANCE: { currency: "USD", text: "~ $" },
}

const DAY = 86_400_000
export const daysLeft = (expiresOn: string, today: string) => Math.round((Date.parse(`${expiresOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY)

export type DocStatus = "valid" | "soon" | "expired"
/** ✅ valid · ⚠️ expiring within 30 days (or today) · 🔴 expired. */
export function docStatus(expiresOn: string, today: string): DocStatus {
  const left = daysLeft(expiresOn, today)
  return left < 0 ? "expired" : left <= SOON_DAYS ? "soon" : "valid"
}

/** Whether today's run sends a reminder (as run_vehicle_doc_alerts): a remind day, the day, or expired (day 1, then weekly). */
export function reminderDue(expiresOn: string, today: string, remindDays: number[] = DEFAULT_REMIND_DAYS): boolean {
  const left = daysLeft(expiresOn, today)
  return remindDays.includes(left) || left === 0 || (left < 0 && -left % 7 === 1)
}

/** «បន្តរួច»: the next expiry suggested — one year after the old one (or after today, when it had long expired). */
export function renewedExpiry(expiresOn: string, today: string, type?: VehicleDocType): string {
  const from = daysLeft(expiresOn, today) < -30 ? today : expiresOn
  const d = new Date(`${from}T12:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  // Road tax: always the GDT deadline, 30 November (a 31 December entered earlier is moved too).
  if (type === "ROAD_TAX") return `${d.getUTCFullYear()}-11-30`
  return d.toISOString().slice(0, 10)
}

/**
 * Road tax (ពន្ធលើមធ្យោបាយដឹកជញ្ជូន): GDT collects each tax year's tax from 1 June to 30 November; after
 * 30 November it costs double (founder, 15/10/2026 — never 31 December). A receipt for tax year Y means
 * Y is paid, so the date to be reminded of is the NEXT deadline: 30 November of Y + 1.
 */
export const ROAD_TAX_DEADLINE = { month: 11, day: 30 } as const
export const roadTaxDue = (taxYear: number): string => `${taxYear + 1}-11-30`

/** Most urgent first: expired, then the soonest expiry. */
export const byUrgency = (a: Pick<VehicleDoc, "expires_on">, b: Pick<VehicleDoc, "expires_on">) => a.expires_on.localeCompare(b.expires_on)
