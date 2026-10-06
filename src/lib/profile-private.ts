"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

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
      const { data, error } = await getSupabaseBrowserClient()!.from("profile_private").select("birth_date, occupation").eq("user_id", userId!).maybeSingle()
      if (error) throw error
      return (data ?? { birth_date: null, occupation: null }) as ProfilePrivate
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

/** Is today this person's birthday? (29 February counts on 28 February in other years.) */
export function isBirthday(birthDate: string | null | undefined, today: Date = new Date()): boolean {
  if (!birthDate) return false
  const [, m, d] = birthDate.split("-").map(Number)
  const tm = today.getMonth() + 1
  const td = today.getDate()
  if (m === tm && d === td) return true
  const year = today.getFullYear()
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return m === 2 && d === 29 && !leap && tm === 2 && td === 28
}
