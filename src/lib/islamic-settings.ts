"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/** The user's own Islamic Finance settings (public.islamic_settings; private to them). */
export type IslamicSettings = {
  enabled: boolean
  nisab_basis: "GOLD" | "SILVER"
  gold_price: number | null
  silver_price: number | null
  gold_grams: number
  hawl_start: string | null
  include_receivables: boolean
  include_business: boolean
}

/** Admin defaults (app_settings "islamic_defaults"). */
export type IslamicDefaults = { gold_price?: string; silver_price?: string; hijri_offset?: string }

export const DEFAULT_ISLAMIC: IslamicSettings = {
  enabled: false,
  nisab_basis: "GOLD",
  gold_price: null,
  silver_price: null,
  gold_grams: 0,
  hawl_start: null,
  include_receivables: false,
  include_business: true,
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v))

export function useIslamicSettings() {
  const userId = useSessionStore((s) => s.user?.id)
  const query = useQuery({
    queryKey: ["islamic-settings", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("islamic_settings").select("*").maybeSingle()
      if (error) throw error
      if (!data) return DEFAULT_ISLAMIC
      return {
        ...DEFAULT_ISLAMIC,
        ...data,
        gold_price: num(data.gold_price),
        silver_price: num(data.silver_price),
        gold_grams: Number(data.gold_grams ?? 0),
      } as IslamicSettings
    },
  })
  return { settings: query.data ?? DEFAULT_ISLAMIC, loading: query.isLoading }
}

/** True when the signed-in user turned the tools on. */
export function useIslamicEnabled(): boolean {
  return useIslamicSettings().settings.enabled
}

export function useIslamicDefaults() {
  return (
    useQuery({
      queryKey: ["islamic-defaults"],
      staleTime: 30 * 60_000,
      queryFn: async () => {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return {}
        const { data } = await supabase.from("app_settings").select("value").eq("key", "islamic_defaults").maybeSingle()
        return (data?.value ?? {}) as IslamicDefaults
      },
    }).data ?? {}
  )
}

export function useIslamicMutations() {
  const queryClient = useQueryClient()
  const userId = useSessionStore((s) => s.user?.id)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["islamic-settings"] })
  return {
    /** On also adds the Zakat / Sadaqah / Waqf / Riba categories (set_islamic_tools). */
    setEnabled: useMutation({
      mutationFn: async (enabled: boolean) => {
        const { error } = await getSupabaseBrowserClient()!.rpc("set_islamic_tools", { p_enabled: enabled })
        if (error) throw error
      },
      onSuccess: () => {
        refresh()
        void queryClient.invalidateQueries({ queryKey: ["categories"] })
      },
    }),
    update: useMutation({
      mutationFn: async (patch: Partial<Omit<IslamicSettings, "enabled">>) => {
        const { error } = await getSupabaseBrowserClient()!
          .from("islamic_settings")
          .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        if (error) throw error
      },
      onSuccess: refresh,
    }),
  }
}
