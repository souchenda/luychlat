/**
 * The nine quick actions under the home hero (founder, 21/10/2026 — after ACLEDA Mobile), three a row:
 *   recording   — scan a slip (the bot) · add an entry · transfer        (editors only)
 *   money tools — loans and CBC · reports · the Islamic hub (Islamic Mode only; else bills)
 *   market      — NBC rates · fuel · gold                                 (/market and its sections)
 * Pure — the tiles are components/dashboard/quick-actions.tsx.
 */
import type { MessageKey } from "@/lib/i18n/dictionaries"

/** The bot reads bank slips (exact amount, the right wallet — golden path 1); the web has no slip reader of its own. */
export const SLIP_BOT_URL = "https://t.me/luychlat_bot"

export type QuickActionKey = "scan" | "entry" | "transfer" | "loans" | "reports" | "islamic" | "bills" | "rates" | "fuel" | "gold"

export type QuickAction = {
  key: QuickActionKey
  label: MessageKey
  /** A page (or the bot, `external`), else a sheet the home page opens (`entry`, `transfer`). */
  href?: string
  external?: boolean
  disabled?: boolean
}

export function quickActions({
  editable,
  personal,
  islamic,
  walletCount,
}: {
  /** Viewers in a family workspace look but do not record. */
  editable: boolean
  /** The K-Score is the person's own credit report: Personal only (as the smart hub). */
  personal: boolean
  /** Islamic Mode is opt-in: the hub only for those who turned it on. */
  islamic: boolean
  /** A transfer needs two wallets. */
  walletCount: number
}): QuickAction[] {
  const recording: QuickAction[] = editable
    ? [
        { key: "scan", label: "quick.scan", href: SLIP_BOT_URL, external: true },
        { key: "entry", label: "quick.entry" },
        { key: "transfer", label: "quick.transfer", disabled: walletCount < 2 },
      ]
    : []
  return [
    ...recording,
    personal
      ? { key: "loans", label: "quick.loansCbc", href: "/debts?tab=PAYABLE#credit-health" }
      : { key: "loans", label: "quick.loans", href: "/debts?tab=PAYABLE" },
    { key: "reports", label: "quick.reports", href: "/reports" },
    islamic ? { key: "islamic", label: "quick.islamic", href: "/islamic" } : { key: "bills", label: "quick.bills", href: "/bills" },
    { key: "rates", label: "quick.rates", href: "/market" },
    { key: "fuel", label: "quick.fuel", href: "/market#fuel" },
    { key: "gold", label: "quick.gold", href: "/market#gold" },
  ]
}
