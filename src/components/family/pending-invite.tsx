"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { useSessionStore } from "@/stores/session-store"

/** An invite link opened before signing in is remembered here and resumed afterwards. */
export const PENDING_INVITE_KEY = "luysmart-pending-invite"

export function savePendingInvite(code: string | null) {
  try {
    if (code) localStorage.setItem(PENDING_INVITE_KEY, code)
    else localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // Storage blocked (private mode): the user can still type the code in Settings.
  }
}

export function readPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

/** After sign-in, sends the user back to the invitation they opened. */
export function PendingInviteRedirect() {
  const router = useRouter()
  const signedIn = useSessionStore((s) => Boolean(s.user))

  useEffect(() => {
    if (!signedIn) return
    const code = readPendingInvite()
    if (code) router.push(`/join?code=${encodeURIComponent(code)}`)
  }, [signedIn, router])

  return null
}
