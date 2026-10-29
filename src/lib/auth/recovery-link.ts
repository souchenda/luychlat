/**
 * Password reset by e-mail that works in ANY browser (founder, 29/10/2026 — asked in one browser, the Gmail link opened
 * in Chrome: «no place to type a new password»). The app's own client uses the PKCE flow: the link's code can only be
 * exchanged by the browser that asked, and the free plan's default e-mail template cannot be changed to carry a
 * token_hash. So the reset is asked with a one-off implicit-flow client (lib/supabase/implicit-client.ts): the link
 * lands on /reset-password with the session in the URL fragment (#access_token=…&refresh_token=…&type=recovery) —
 * never sent to our server, read by the page, then wiped from the address bar.
 * Pure (recovery-link.test.ts).
 */

export const RESET_PATH = "/reset-password"

export type RecoveryLink =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; code: string }
  | null

/** What the reset link brought in `location.hash`; null when it brought nothing. */
export function recoveryFromHash(hash: string): RecoveryLink {
  const p = new URLSearchParams(hash.replace(/^#/, ""))
  const error = p.get("error_code") ?? p.get("error")
  if (error) return { kind: "error", code: error }
  const accessToken = p.get("access_token")
  const refreshToken = p.get("refresh_token")
  if (accessToken && refreshToken && p.get("type") === "recovery") return { kind: "session", accessToken, refreshToken }
  return null
}
