import { formatPhoneLocal } from "@/lib/format"
import { isValidNationalNumber, toNationalNumber } from "@/lib/phone"

/**
 * Sign in with a phone number OR an email — no SMS. A Cambodian number becomes
 * an internal address 855<national>@PHONE_LOGIN_DOMAIN, used with a password
 * through Supabase's email provider (no message is ever sent to it).
 *
 * The domain is a subdomain of ibmserp.com (ours) with no mail server, so
 * nothing addressed to it can be delivered to anyone — never use a domain we
 * don't own: a password-reset link sent there would hand over the account.
 * Mirrored in SQL by public.is_phone_login_email(); never change it, or the
 * existing phone accounts can no longer sign in.
 */
export const PHONE_LOGIN_DOMAIN = "phone.luy.ibmserp.com"

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type LoginIdentifier =
  | { kind: "email"; email: string }
  /** `phone` is the local form saved on the profile, e.g. "078824222". */
  | { kind: "phone"; email: string; phone: string }

/** What the person typed → how to sign in, or null when it's neither a valid email nor a Cambodian number. */
export function parseLoginIdentifier(input: string): LoginIdentifier | null {
  const value = input.trim()
  if (value.includes("@")) {
    const email = value.toLowerCase()
    return EMAIL_PATTERN.test(email) && !isPhoneLoginEmail(email) ? { kind: "email", email } : null
  }
  if (!/^[+\d\s\-().]+$/.test(value)) return null
  const national = toNationalNumber(value)
  if (!isValidNationalNumber(national)) return null
  return { kind: "phone", email: `855${national}@${PHONE_LOGIN_DOMAIN}`, phone: `0${national}` }
}

export const isPhoneLoginEmail = (email: string | null | undefined) => Boolean(email?.toLowerCase().endsWith(`@${PHONE_LOGIN_DOMAIN}`))

/** How an account's sign-in shows on screen: a phone account as its number ("078 824 222"), others as the email. */
export function loginLabel(email: string | null | undefined): string {
  if (!email) return ""
  if (!isPhoneLoginEmail(email)) return email
  return formatPhoneLocal(email.split("@")[0])
}
