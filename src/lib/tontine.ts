import { addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from "date-fns"

import type { Tontine, TontinePayment } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"
import { roundMoney } from "@/lib/money"

/**
 * តុងទីន rules used by the screens. The database stores what actually
 * happened (each round paid, the pot won); this derives the schedule and
 * status from it.
 */

/** Date of round n (1-based), yyyy-MM-dd. */
export function roundDate(t: Pick<Tontine, "start_date" | "frequency">, round: number): string {
  const start = parseISO(t.start_date)
  const date = t.frequency === "WEEKLY" ? addWeeks(start, round - 1) : addMonths(start, round - 1)
  return format(date, "yyyy-MM-dd")
}

export type RoundState = "paid" | "won" | "due" | "overdue" | "upcoming"

export type TontineProgress = {
  /** Paid rounds + the won round. */
  settled: number
  /** First round still to pay (null when every round is settled). */
  nextRound: number | null
  nextDate: string | null
  /** Days until the next round (negative: overdue). */
  daysLeft: number | null
  dead: boolean
  complete: boolean
  totalPaid: number
  /** Saved through bids while live (sum of discounts). */
  totalDiscount: number
  /** Pot received (0 until won). */
  collected: number
  /** collected − paid so far. */
  net: number
  /** Expected amount for the next round: full share when dead; live members usually pay less. */
  nextAmount: number
}

export function tontineProgress(t: Tontine, payments: TontinePayment[], today: string = todayDate()): TontineProgress {
  const mine = payments.filter((p) => p.tontine_id === t.id)
  const paidRounds = new Set(mine.map((p) => p.round_no))
  let nextRound: number | null = null
  for (let r = 1; r <= t.total_rounds; r++) {
    if (!paidRounds.has(r) && r !== t.won_round) {
      nextRound = r
      break
    }
  }
  const nextDate = nextRound ? roundDate(t, nextRound) : null
  const totalPaid = roundMoney(
    mine.reduce((s, p) => s + p.amount, 0),
    t.currency,
  )
  const collected = t.won_amount ?? 0
  return {
    settled: paidRounds.size + (t.won_round ? 1 : 0),
    nextRound,
    nextDate,
    daysLeft: nextDate ? differenceInCalendarDays(parseISO(nextDate), parseISO(today)) : null,
    dead: t.won_round !== null,
    complete: nextRound === null,
    totalPaid,
    totalDiscount: roundMoney(
      mine.reduce((s, p) => s + p.discount, 0),
      t.currency,
    ),
    collected,
    net: roundMoney(collected - totalPaid, t.currency),
    nextAmount: t.share_amount,
  }
}

export function roundStates(t: Tontine, payments: TontinePayment[], today: string = todayDate()): { round: number; date: string; state: RoundState; payment?: TontinePayment }[] {
  const byRound = new Map(payments.filter((p) => p.tontine_id === t.id).map((p) => [p.round_no, p]))
  return Array.from({ length: t.total_rounds }, (_, i) => {
    const round = i + 1
    const date = roundDate(t, round)
    const payment = byRound.get(round)
    const state: RoundState = payment
      ? "paid"
      : round === t.won_round
        ? "won"
        : date < today
          ? "overdue"
          : differenceInCalendarDays(parseISO(date), parseISO(today)) <= 3
            ? "due"
            : "upcoming"
    return { round, date, state, payment }
  })
}

/** Open tontines first by next due date; finished/closed ones last. */
export function byNextDue(a: { t: Tontine; p: TontineProgress }, b: { t: Tontine; p: TontineProgress }) {
  const rank = (x: { t: Tontine; p: TontineProgress }) => (x.t.closed_at || x.p.complete ? 1 : 0)
  return rank(a) - rank(b) || (a.p.nextDate ?? "9999").localeCompare(b.p.nextDate ?? "9999")
}

/** Tontines with a round due within `days` (or overdue), for reminders. */
export function dueTontines(tontines: Tontine[], payments: TontinePayment[], days = 2, today: string = todayDate()) {
  return tontines
    .filter((t) => !t.closed_at)
    .map((t) => ({ t, p: tontineProgress(t, payments, today) }))
    .filter(({ p }) => p.daysLeft !== null && p.daysLeft <= days)
    .sort(byNextDue)
}
