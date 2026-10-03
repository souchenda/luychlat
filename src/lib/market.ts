"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { MarketLive } from "@/lib/market-calc"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export const marketKeys = { live: ["market-live"] as const }

/** Live NBC rates and gold reference prices (refreshed by the server every 30 minutes). */
export function useMarket() {
  return useQuery({
    queryKey: marketKeys.live,
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return null
      const { data } = await supabase.from("app_settings").select("value").eq("key", "market_live").maybeSingle()
      return (data?.value as MarketLive | undefined) ?? null
    },
  })
}

/** "🔄 Refresh": asks the server to fetch now (it fetches at most every few minutes). */
export function useRefreshMarket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseBrowserClient()
      const token = (await supabase?.auth.getSession())?.data.session?.access_token
      const res = await fetch("/api/market/refresh", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error(String(res.status))
      return (await res.json()) as MarketLive | null
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(marketKeys.live, data)
      void queryClient.invalidateQueries({ queryKey: ["gold-rates"] })
    },
  })
}
