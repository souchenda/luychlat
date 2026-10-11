/**
 * A workspace's KHQR codes (public.workspace_khqr_codes): ABA $, ABA ៛, ACLEDA ៛, Wing… kept on
 * /invoices, switched on the /soundbox cashier screen. Pure helpers here (khqr-codes.test.ts);
 * the hooks are in src/lib/khqr-codes-data.ts.
 */
import type { KhqrBank } from "@/lib/khqr"

export type KhqrCode = {
  id: string
  workspace_id: string
  wallet_id: string | null
  bank_code: KhqrBank
  currency: "KHR" | "USD"
  merchant_name: string | null
  khqr_payload: string
  image_path: string | null
  is_default: boolean
  created_at: string
}

export const BANK_LOOK: Record<KhqrBank, { label: string; dot: string; ring: string }> = {
  ABA: { label: "ABA", dot: "🔵", ring: "bg-sky-600" },
  ACLEDA: { label: "ACLEDA", dot: "🟡", ring: "bg-amber-500" },
  WING: { label: "Wing", dot: "🟢", ring: "bg-lime-500" },
  CANADIA: { label: "Canadia", dot: "🔴", ring: "bg-red-600" },
  SATHAPANA: { label: "Sathapana", dot: "🟣", ring: "bg-violet-600" },
  OTHER: { label: "KHQR", dot: "⚪", ring: "bg-slate-400" },
}

/** «🔵 ABA ($)», «🟡 ACLEDA (៛)» — the switcher tab and the list title. */
export const codeLabel = (c: Pick<KhqrCode, "bank_code" | "currency">) => `${BANK_LOOK[c.bank_code].dot} ${BANK_LOOK[c.bank_code].label} (${c.currency === "USD" ? "$" : "៛"})`

/** The default first, then by bank and currency, then oldest first — the same order everywhere. */
export function sortCodes(codes: KhqrCode[]): KhqrCode[] {
  const banks: KhqrBank[] = ["ABA", "ACLEDA", "WING", "CANADIA", "SATHAPANA", "OTHER"]
  return [...codes].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      banks.indexOf(a.bank_code) - banks.indexOf(b.bank_code) ||
      (a.currency === b.currency ? 0 : a.currency === "USD" ? -1 : 1) ||
      a.created_at.localeCompare(b.created_at),
  )
}

/**
 * Which code the SoundBox shows: the one tapped (while it still exists), else the default, else the
 * first. Null with no codes.
 */
export function selectedCode(codes: KhqrCode[], chosenId: string | null): KhqrCode | null {
  return codes.find((c) => c.id === chosenId) ?? codes.find((c) => c.is_default) ?? sortCodes(codes)[0] ?? null
}

/** A new code from an uploaded QR: the same payload twice in a workspace is refused (it is kept once). */
export const isDuplicate = (codes: Pick<KhqrCode, "khqr_payload">[], payload: string) => codes.some((c) => c.khqr_payload === payload)
