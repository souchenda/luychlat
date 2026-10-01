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
