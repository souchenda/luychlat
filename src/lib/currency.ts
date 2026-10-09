/**
 * Cambodian riel in the hand: the smallest note is 100៛, so a riel figure the app
 * CALCULATES (an estimate — EV charging at the electricity rate, a cost from kWh…) is
 * shown to the nearest 100៛, never "32,996៛". Recorded amounts (a slip, a bank alert,
 * a bill) keep the bank's exact figure. Pure (currency.test.ts).
 */
export function roundToNearest100KHR(amount: number): number {
  return Math.round(amount / 100) * 100
}
