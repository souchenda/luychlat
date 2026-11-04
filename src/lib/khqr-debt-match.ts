/**
 * Which open customer debt (AR) a KHQR payment may be repaying (founder, 4/11/2026): the payer's name as the bank prints it
 * against the debt's customer name. A suggestion only — the owner taps ✅ before anything is booked
 * (public.bot_khqr_debt_settle). Pure (khqr-debt-match.test.ts).
 *
 *   «TIM SREYLEAK» ~ «Sreyleak Tim» ~ «Tim Sreyleak (ហាងបាយ)»: the same words in any order, case and punctuation aside
 *   one candidate only — two debts that both fit and match, and nothing is offered (never a guess between customers)
 *   the debt must be in the payment's currency, with at least the payment left on it (the database checks it again)
 */
export type OpenDebt = { id: string; party_name: string; remaining: number }

/** Lower case, NFC, letters and digits only (Khmer kept), as words. */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 2)
}

/** The payer and the customer are the same name: every word of the shorter name is in the longer (at least one real word). */
export function sameName(payer: string, party: string): boolean {
  const a = nameWords(payer)
  const b = nameWords(party)
  if (!a.length || !b.length) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (!short.some((w) => w.length >= 3)) return false
  return short.every((w) => long.includes(w))
}

/** The one debt this payment may repay, or null (none, or more than one — the owner is never asked to choose between guesses). */
export function matchDebt(payment: { amount: number; payer: string | null | undefined }, debts: OpenDebt[]): OpenDebt | null {
  if (!payment.payer) return null
  const fits = debts.filter((d) => Number(d.remaining) + 0.005 >= payment.amount && sameName(payment.payer!, d.party_name))
  return fits.length === 1 ? fits[0] : null
}
