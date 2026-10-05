/**
 * Cambodian (+855) phone helpers. People type numbers the local way
 * ("012 345 678", "096 123 4567") or with the country code; we keep only the
 * national significant number: 8-9 digits without the trunk "0".
 */
export const KH_COUNTRY_CODE = "+855"

export function toNationalNumber(input: string): string {
  let digits = input.replace(/\D/g, "")
  if (digits.startsWith("855")) digits = digits.slice(3)
  digits = digits.replace(/^0+/, "")
  return digits.slice(0, 9)
}

/** "12345678" -> "12 345 678", "961234567" -> "96 123 4567" */
export function formatNationalNumber(national: string): string {
  if (national.length <= 2) return national
  if (national.length <= 5) return `${national.slice(0, 2)} ${national.slice(2)}`
  return `${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`
}

export function isValidNationalNumber(national: string): boolean {
  return /^[1-9]\d{7,8}$/.test(national)
}

export function toE164(national: string): string {
  return `${KH_COUNTRY_CODE}${national}`
}

/**
 * For display, with spaces, the way it was written:
 *   "078824222"     -> "078 824 222"      (9 digits: 0XX XXX XXX)
 *   "0123456789"    -> "012 345 6789"     (10 digits: 0XX XXX XXXX)
 *   "+85578824222"  -> "+855 78 824 222"  (with the country code: +855 XX XXX XXX)
 * Anything that isn't a Cambodian mobile/landline number is returned as typed.
 */
export function formatPhoneDisplay(raw: string): string {
  const trimmed = raw.trim()
  const compact = trimmed.replace(/[\s-]/g, "")
  // Another country's code: leave it as the user wrote it.
  if (compact.startsWith("+") && !compact.startsWith("+855")) return trimmed
  const national = toNationalNumber(trimmed)
  if (!isValidNationalNumber(national)) return trimmed
  if (compact.startsWith("+855")) return `${KH_COUNTRY_CODE} ${formatNationalNumber(national)}`
  const local = `0${national}`
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}

/** A number the app stored as +855… but the person typed the local way: "078 824 222". */
export const formatPhoneLocal = (raw: string) => formatPhoneDisplay(`0${toNationalNumber(raw)}`)
