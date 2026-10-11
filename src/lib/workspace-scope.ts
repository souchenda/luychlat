/**
 * Strict separation between a business and the person (founder decision 11/10/2026): what each kind
 * of workspace shows. A business tracks its own operating bills, sales and debts — never the
 * family's NSSF cards, home EV charging or Buddhist holy-day reminders; Personal keeps all of them.
 * Pure (workspace-scope.test.ts); used by /bills, the bill presets and the notification bell.
 */
import type { BillKind } from "@/lib/bills"

export type WorkspaceType = "PERSONAL" | "FAMILY" | "BUSINESS"

export type Scope = {
  /** NSSF member cards, the NSSF guide and NSSF bills. */
  nssf: boolean
  /** 🪷 ថ្ងៃសីល / festival offering reminders (bills page card and bell). */
  holyDays: boolean
  /** Home EV charging (household electricity). */
  homeEv: boolean
}

export function scopeOf(type: WorkspaceType | undefined): Scope {
  const personal = type !== "BUSINESS"
  return { nssf: personal, holyDays: personal, homeEv: personal }
}

/** The bill kinds a workspace can add (a business: no NSSF member contributions). */
export const billKindAllowed = (kind: BillKind, type: WorkspaceType | undefined) => kind !== "NSSF" || scopeOf(type).nssf
