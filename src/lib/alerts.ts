import { format, parseISO } from "date-fns"

import type { AlertKey, Debt } from "@/lib/data/types"
import { daysLeft, debtStatus, remaining, todayDate } from "@/lib/debts"
import { formatMoney } from "@/lib/money"

/**
 * Mirrors public.debt_alert_stage(): ranges rather than exact days so a missed
 * run still fires the stage; each stage fires once per debt.
 */
export function alertStage(debt: Pick<Debt, "due_date">, today: string = todayDate()): AlertKey | null {
  const days = daysLeft(debt, today)
  if (days === null) return null
  if (days >= 4 && days <= 7) return "D7"
  if (days >= 1 && days <= 3) return "D3"
  if (days === 0) return "D0"
  if (days < 0) return "OVERDUE"
  return null
}

/** Open debts that are in an alert stage today. */
export function dueAlerts(debts: Debt[], today: string = todayDate()) {
  return debts.flatMap((debt) => {
    if (debtStatus(debt, today) === "SETTLED") return []
    const stage = alertStage(debt, today)
    return stage ? [{ debt, stage }] : []
  })
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Same wording as run_debt_alerts(); `html` escapes the party name for Telegram's HTML mode. */
export function alertText(debt: Debt, stage: AlertKey, language: "km" | "en", opts?: { html?: boolean }) {
  const days = daysLeft(debt) ?? 0
  const name = opts?.html ? escapeHtml(debt.party_name) : debt.party_name
  const left = formatMoney(remaining(debt), debt.currency)
  const total = formatMoney(debt.total_amount, debt.currency)
  const due = debt.due_date ? format(parseISO(debt.due_date), "dd/MM/yyyy") : "-"

  if (language === "km") {
    const title =
      stage === "OVERDUE" ? "🔴 បំណុលហួសកំណត់" : stage === "D0" ? "🔴 ដល់ថ្ងៃកំណត់ថ្ងៃនេះ" : `🟠 ជិតដល់ថ្ងៃកំណត់ (${days} ថ្ងៃទៀត)`
    const side = debt.type === "PAYABLE" ? "📤 ត្រូវសងគេ" : "📥 គេជំពាក់យើង"
    return { title, body: `${side}: ${name}\n💰 នៅខ្វះ: ${left} / ${total}\n📅 ថ្ងៃកំណត់: ${due}` }
  }
  const title = stage === "OVERDUE" ? "🔴 Debt overdue" : stage === "D0" ? "🔴 Due today" : `🟠 Due soon (${days} days left)`
  const side = debt.type === "PAYABLE" ? "📤 I owe" : "📥 Owed to me"
  return { title, body: `${side}: ${name}\n💰 Remaining: ${left} of ${total}\n📅 Due: ${due}` }
}

/** Full Telegram message (HTML parse mode). */
export function telegramAlertMessage(debt: Debt, stage: AlertKey, language: "km" | "en") {
  const { title, body } = alertText(debt, stage, language, { html: true })
  return `<b>${title}</b>\n${body}\n\n— លុយឆ្លាត · LuySmart`
}
