"use client"

import { create } from "zustand"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * The welcome guide (components/onboarding/welcome-guide.tsx): opens by itself
 * once for a new account; Settings › App guide replays it any time.
 * "Seen" lives in localStorage and, signed in, in profile_private.
 */
export const ONBOARDING_KEY = "luychlat:has_seen_onboarding_guide"

export const useOnboardingStore = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

export function seenOnDevice(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1"
  } catch {
    return false
  }
}

/** Remember it everywhere (best effort: a failure only means it might show once more). */
export async function markOnboardingSeen(userId: string | undefined) {
  try {
    localStorage.setItem(ONBOARDING_KEY, "1")
  } catch {}
  const supabase = getSupabaseBrowserClient()
  if (!supabase || !userId) return
  await supabase.from("profile_private").upsert({ user_id: userId, has_seen_onboarding_guide: true, updated_at: new Date().toISOString() }).then(
    () => undefined,
    () => undefined,
  )
}

/** Seen on another device (synced)? */
export async function seenInProfile(userId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return false
  const { data } = await supabase.from("profile_private").select("has_seen_onboarding_guide").eq("user_id", userId).maybeSingle()
  return Boolean((data as { has_seen_onboarding_guide?: boolean } | null)?.has_seen_onboarding_guide)
}
