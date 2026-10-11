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
export function renewedExpiry(expiresOn: string, today: string): string {
  const from = daysLeft(expiresOn, today) < -30 ? today : expiresOn
  const d = new Date(`${from}T12:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

/** Most urgent first: expired, then the soonest expiry. */
export const byUrgency = (a: Pick<VehicleDoc, "expires_on">, b: Pick<VehicleDoc, "expires_on">) => a.expires_on.localeCompare(b.expires_on)
