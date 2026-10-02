"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Two-factor sign-in with an authenticator app (Supabase MFA, TOTP). The
 * database refuses data to an account with 2FA until the session is "aal2"
 * (code verified), see public.mfa_ok(); the app shows the code screen first.
 */
const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

export type MfaState = {
  /** A verified authenticator, if any. */
  factorId: string | null
  /** This session still has to enter a code. */
  needsCode: boolean
}

export function useMfaState() {
  const userId = useSessionStore((s) => s.user?.id)
  return useQuery({
    queryKey: ["mfa", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<MfaState> => {
      const supabase = client()
      const [{ data: factors }, { data: aal }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()])
      const factor = factors?.totp?.find((f) => f.status === "verified") ?? null
      return { factorId: factor?.id ?? null, needsCode: aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" }
    },
  })
}

export function useRefreshMfa() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["mfa"] })
}

/** Start setting up 2FA: drops abandoned set-ups, returns the QR code (SVG data URL) and the secret. */
export async function startEnrollment(): Promise<{ factorId: string; qr: string; secret: string }> {
  const supabase = client()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `LuyChlat ${new Date().toISOString().slice(0, 10)}`, issuer: "LuyChlat" })
  if (error || !data) throw error ?? new Error("enroll failed")
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

/** Checks a 6-digit code (finishing set-up, signing in, or confirming a risky action). */
export async function verifyCode(factorId: string, code: string): Promise<boolean> {
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId, code })
  return !error
}

/** Turns 2FA off (the session must have passed a code first). */
export async function disableMfa(factorId: string) {
  const { error } = await client().auth.mfa.unenroll({ factorId })
  if (error) throw error
}
