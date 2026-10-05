/**
 * A bank account number for display, masked in the middle. Cambodian
 * accounts are often phone numbers that share the last digits
 * (078824222 vs 016824222), so the prefix is kept too:
 *   078824222    → 078***4222
 *   1234 5678 90 → 123***7890   (spaces and dashes are ignored)
 *   12345        → 12***45      (5–7 digits: first 2 and last 2)
 *   1234         → 1234         (too short to mask)
 * Only for screens behind the login: Telegram messages keep just the last 4
 * (maskNumbers in the bot).
 */
export function maskAccountNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[\s-]/g, "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 2)}***${digits.slice(-2)}`
  return `${digits.slice(0, 3)}***${digits.slice(-4)}`
}
