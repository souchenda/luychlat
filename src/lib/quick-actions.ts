/**
 * The nine quick actions under the home hero (founder, 21/10/2026 — essential actions only, no filler: the rates, gold
 * and fuel are on the hero's ticker and in one market hub), three a row:
 *   daily cash   — scan a slip (in the app's own scanner) · quick entry (expense ⇄ income) · transfer      (editors only)
 *   obligations  — loans and CBC · savings goals · monthly bills
 *   control      — budgets · the market hub (NBC rates, gold, fuel) · the Islamic hub with Islamic Mode, else the
 *                  report export (Excel / PDF)
 * A Business workspace (founder, 21/10/2026 — Task #438, merchant operations, not personal savings):
 *   daily cash   — scan a slip · sales / income · general expense                        (editors only)
 *   money owed   — transfer (editors only) · customers owe (AR, /business/ar) · we owe (AP, /business/ap)
 *   operations   — monthly bills · the market hub (NBC and fuel) · the report export
 * Pure — the tiles are components/dashboard/quick-actions.tsx.
 */
import type { MessageKey } from "@/lib/i18n/dictionaries"

/**
 * The bot, for what the app's scanner sends on (bills, loan schedules, account screens) — the scan tile itself opens the
 * in-app scanner (founder, 21/10/2026: it used to send people out to Telegram), never an external page.
 */
export const SLIP_BOT_URL = "https://t.me/luychlat_bot"

export type QuickActionKey =
  | "scan"
  | "entry"
  | "income"
  | "expense"
  | "transfer"
  | "loans"
  | "receivable"
  | "payable"
  | "goals"
  | "bills"
  | "budgets"
  | "market"
  | "islamic"
  | "export"

export type QuickAction = {
  key: QuickActionKey
  label: MessageKey
  /** A page (or an outside link, `external`), else a sheet the home page opens (`scan`, `entry` / `income` / `expense`, `transfer`). */
  href?: string
  external?: boolean
  disabled?: boolean
}

export function quickActions({
  editable,
  personal,
  business = false,
  islamic,
  walletCount,
}: {
  /** Viewers in a family workspace look but do not record. */
  editable: boolean
  /** The K-Score is the person's own credit report: Personal only (as the smart hub). */
  personal: boolean
  /** A Business workspace: the merchant grid (sales, expenses, AR / AP) instead of goals and budgets. */
  business?: boolean
  /** Islamic Mode is opt-in: the hub only for those who turned it on. */
  islamic: boolean
  /** A transfer needs two wallets. */
  walletCount: number
}): QuickAction[] {
  if (business) {
    const transfer: QuickAction[] = editable ? [{ key: "transfer", label: "quick.transfer", disabled: walletCount < 2 }] : []
    return [
      ...(editable
        ? ([
            { key: "scan", label: "quick.scan" },
            { key: "income", label: "quick.sale" },
            { key: "expense", label: "quick.expense" },
          ] satisfies QuickAction[])
        : []),
      ...transfer,
      { key: "receivable", label: "quick.receivable", href: "/business/ar" },
      { key: "payable", label: "quick.payable", href: "/business/ap" },
      { key: "bills", label: "quick.bills", href: "/bills" },
      { key: "market", label: "quick.marketBiz", href: "/market" },
      { key: "export", label: "quick.export", href: "/reports#export" },
    ]
  }
  const daily: QuickAction[] = editable
    ? [
        { key: "scan", label: "quick.scan" },
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
