"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { AcquisitionAnswer } from "@/lib/acquisition"
import { isBirthdayToday } from "@/lib/birthday"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Optional details only the owner (and the super admin's customer list) can
 * read: date of birth (birthday wishes) and occupation. Kept out of
 * public.profiles, which family-workspace members can read.
 */
export const OCCUPATIONS = ["STUDENT", "EMPLOYEE", "BUSINESS_OWNER", "GENERAL"] as const
export type Occupation = (typeof OCCUPATIONS)[number]
export type ProfilePrivate = { birth_date: string | null; occupation: Occupation | null }


const key = (userId: string | undefined) => ["profile-private", userId] as const

export function useProfilePrivate() {
  const userId = useSessionStore((s) => s.user?.id)
  return useQuery({
    queryKey: key(userId),
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("profile_private").select("birth_date, occupation, acquisition_source").eq("user_id", userId!).maybeSingle()
      if (error) throw error
      return (data ?? { birth_date: null, occupation: null, acquisition_source: null }) as ProfilePrivate & { acquisition_source: AcquisitionAnswer | null }
    },
  })
}

export function useSaveProfilePrivate() {
  const userId = useSessionStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: ProfilePrivate) => {
      const { error } = await getSupabaseBrowserClient()!
        .from("profile_private")
        .upsert({ user_id: userId!, birth_date: v.birth_date || null, occupation: v.occupation, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key(userId) }),
  })
}

/** The first-visit answer: saved alone (the birthday and occupation are left as they are). */
export function useSaveAcquisitionSource() {
  const userId = useSessionStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (source: AcquisitionAnswer) => {
      const { error } = await getSupabaseBrowserClient()!
        .from("profile_private")
        .upsert({ user_id: userId!, acquisition_source: source, acquisition_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key(userId) }),
  })
}

/**
 * A date of birth read from a scanned card, saved only when none is set yet (occupation kept).
 * Returns true when it was saved. The caller decides it is the person's OWN card (an NSSF card marked
 * «self», or the person's tap) — a spouse's card never becomes their birthday by itself.
 */
export function useFillBirthDate() {
  const current = useProfilePrivate().data
  const save = useSaveProfilePrivate()
  return async (dob: string | null | undefined): Promise<boolean> => {
    if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !current || current.birth_date) return false
    await save.mutateAsync({ birth_date: dob, occupation: current.occupation })
    return true
  }
}

/** Is today (Cambodia time) this person's birthday? (29 February counts on 28 February in other years.) */
export function isBirthday(birthDate: string | null | undefined, now: number = Date.now()): boolean {
  return isBirthdayToday(birthDate, now)
}
