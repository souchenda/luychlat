"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { useActiveWorkspace } from "@/lib/data/hooks"
import { DEFAULT_KHR_PER_USD, LEGACY_DEFAULT_KHR_PER_USD } from "@/lib/money"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * The exchange rate is saved per workspace in the database (workspaces.khr_per_usd).
 * Screens read it through the prefs store (usePrefsStore(s => s.khrPerUsd)),
 * which this keeps equal to the active workspace's saved rate.
 */
export function ExchangeRateSync() {
  const { workspace } = useActiveWorkspace()
  const save = useSaveExchangeRate()
  const saved = workspace?.khr_per_usd ?? null
  const workspaceId = workspace?.id
  const canSet = workspace?.role === "OWNER"

  useEffect(() => {
    if (!workspaceId) return
    const local = usePrefsStore.getState().khrPerUsd
    if (saved !== null) {
      if (local !== saved) usePrefsStore.getState().setKhrPerUsd(saved)
      return
    }
    // Not saved yet: the owner's device saves its current rate once (the one
    // the user set here, or 4,000), so from then on the value is stored and
    // never depends on a built-in default. (The prefs store already turned the
    // old 4,100 default into 4,000.)
    if (canSet) {
      if (!save.isPending) save.mutate(local === LEGACY_DEFAULT_KHR_PER_USD ? DEFAULT_KHR_PER_USD : local)
    } else if (local !== DEFAULT_KHR_PER_USD) {
      usePrefsStore.getState().setKhrPerUsd(DEFAULT_KHR_PER_USD)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the workspace or its saved rate changes
  }, [workspaceId, saved, canSet])

  return null
}

/** Saves the rate to every workspace the user owns, then applies it here. */
export function useSaveExchangeRate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rate: number) => {
      const { error } = await getSupabaseBrowserClient()!.rpc("set_exchange_rate", { p_rate: Math.round(rate) })
      if (error) throw error
      return Math.round(rate)
    },
    onSuccess: (rate) => {
      usePrefsStore.getState().setKhrPerUsd(rate)
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}
