/**
 * How a wallet's name shows on cards: a masked account number in the name
 * ("ACLEDA 386***6262") becomes its last digits with the currency —
 * "ACLEDA KHR (*6262)" — so two wallets of one bank never look alike once the
 * card truncates. Other names are shown as typed. Pure.
 */
export function walletDisplayName(w: { name: string; currency: string }): string {
  const m = /^(.*?)[\s·-]*\d{0,6}[*•xX]{2,}\d*?(\d{3,4})\s*$/.exec(w.name.trim())
  if (!m || !m[1].trim()) return w.name
  const base = m[1].trim()
  const hasCurrency = new RegExp(`(^|\\s)${w.currency}(\\s|$)`, "i").test(base)
  return `${base}${hasCurrency ? "" : ` ${w.currency}`} (*${m[2]})`
}
