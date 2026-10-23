/**
 * «ចាក់សោរសមតុល្យដោយលេខកូដ 6 ខ្ទង់» (founder, 23/10/2026 — Task #477): the phone lent to a child, a relative or staff —
 * the balances stay masked until the PIN is entered (the App Lock's PIN, PBKDF2-hashed with its own salt —
 * lib/security/pin.ts; never stored in plain text). Five wrong PINs in a row → 30 s before the next try, so a child
 * can't guess through. Revealed balances mask again after 60 s without a touch (and when the app leaves the screen —
 * BalancePrivacyGuard). Pure; the state is kept on the phone (a reload never resets the count).
 */
export const REVEAL_MAX_ATTEMPTS = 5
export const REVEAL_COOLDOWN_MS = 30_000
export const REVEAL_IDLE_MS = 60_000
export const REVEAL_STATE_KEY = "luychlat-balance-reveal"

export type RevealState = { failed: number; until: number | null }
export const NO_FAILURES: RevealState = { failed: 0, until: null }

/** A wrong PIN: one more failure, or — the fifth — a 30 s wait and the count starts over. */
export function revealFailure(s: RevealState, now: number): RevealState {
  const failed = s.failed + 1
  return failed >= REVEAL_MAX_ATTEMPTS ? { failed: 0, until: now + REVEAL_COOLDOWN_MS } : { failed, until: null }
}

/** Seconds still to wait before the next try (0: free to try). */
export const revealWaitSeconds = (s: RevealState, now: number) => (s.until && s.until > now ? Math.ceil((s.until - now) / 1000) : 0)

/** Tries left before the wait. */
export const revealTriesLeft = (s: RevealState) => REVEAL_MAX_ATTEMPTS - s.failed

/** The saved state, or none — anything unreadable counts as no failures (never a lock-out by a broken value). */
export function readRevealState(raw: string | null): RevealState {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<RevealState> | null
    const failed = Number(v?.failed)
    const until = v?.until == null ? null : Number(v.until)
    return { failed: Number.isInteger(failed) && failed >= 0 && failed < REVEAL_MAX_ATTEMPTS ? failed : 0, until: until !== null && Number.isFinite(until) ? until : null }
  } catch {
    return NO_FAILURES
  }
}

/**
 * The eye: hidden → asks for the PIN only when the lock is on and a PIN exists (else it reveals at once); shown → masks
 * at once, never a PIN.
 */
export function eyeAction(o: { hidden: boolean; lockOn: boolean; hasPin: boolean }): "ask-pin" | "reveal" | "hide" {
  if (!o.hidden) return "hide"
  return o.lockOn && o.hasPin ? "ask-pin" : "reveal"
}
