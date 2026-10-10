"use client"

import { useQuery } from "@tanstack/react-query"

import type { BankAtm } from "@/lib/atm"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** All ATMs and branches (public data, a few hundred rows): distances and filters are computed on the device. */
export function useBankAtms() {
  return useQuery({
    queryKey: ["bank-atms"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return [] as BankAtm[]
      const { data, error } = await supabase
        .from("bank_atms")
        .select("osm_ref, bank_code, type, name_kh, name_en, address, province, province_km, latitude, longitude, currencies, is_24h")
        .limit(5000)
      if (error) throw error
      return (data ?? []) as BankAtm[]
    },
  })
}
