/**
 * The nine quick actions under the home hero (founder, 21/10/2026 — essential actions only, no filler: the rates, gold
 * and fuel are on the hero's ticker and in one market hub), three a row:
 *   daily cash   — scan a slip (the bot) · quick entry (expense ⇄ income) · transfer      (editors only)
 *   obligations  — loans and CBC · savings goals · monthly bills
 *   control      — budgets · the market hub (NBC rates, gold, fuel) · the Islamic hub with Islamic Mode, else the
 *                  report export (Excel / PDF)
 * Pure — the tiles are components/dashboard/quick-actions.tsx.
 */
import type { MessageKey } from "@/lib/i18n/dictionaries"

/** The bot reads bank slips (exact amount, the right wallet — golden path 1); the web has no slip reader of its own. */
export const SLIP_BOT_URL = "https://t.me/luychlat_bot"

export type QuickActionKey = "scan" | "entry" | "transfer" | "loans" | "goals" | "bills" | "budgets" | "market" | "islamic" | "export"

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
  const daily: QuickAction[] = editable
    ? [
        { key: "scan", label: "quick.scan", href: SLIP_BOT_URL, external: true },
        { key: "entry", label: "quick.entry" },
        { key: "transfer", label: "quick.transfer", disabled: walletCount < 2 },
      ]
    : []
  return [
    ...daily,
    personal
      ? { key: "loans", label: "quick.loansCbc", href: "/debts?tab=PAYABLE#credit-health" }
      : { key: "loans", label: "quick.loans", href: "/debts?tab=PAYABLE" },
    { key: "goals", label: "quick.goals", href: "/goals" },
    { key: "bills", label: "quick.bills", href: "/bills" },
    { key: "budgets", label: "quick.budgets", href: "/budgets" },
    { key: "market", label: "quick.market", href: "/market" },
    islamic ? { key: "islamic", label: "quick.islamic", href: "/islamic" } : { key: "export", label: "quick.export", href: "/reports#export" },
  ]
}
