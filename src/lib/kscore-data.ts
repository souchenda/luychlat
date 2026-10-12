"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { KScoreRead } from "@/lib/kscore"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

export type CreditScore = KScoreRead & { id: string }

/** The person's latest CBC K-Score (theirs only — RLS: user_id = auth.uid()). */
export function useLatestKScore() {
  const userId = useSessionStore((s) => s.user?.id)
  return useQuery({
    queryKey: ["kscore", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<CreditScore | null> => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return null
      const { data, error } = await supabase.from("credit_scores").select("id, score, risk_label, score_date, history, factors").order("score_date", { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      if (!data) return null
      return { id: data.id, score: data.score, riskLabel: data.risk_label, scoreDate: data.score_date, history: data.history ?? [], factors: data.factors ?? [] }
    },
  })
}

export function useSaveKScore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (k: KScoreRead) => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) throw new Error("offline")
      const { error } = await supabase
        .from("credit_scores")
        .upsert({ source: "CBC_KSCORE", score: k.score, risk_label: k.riskLabel, score_date: k.scoreDate, history: k.history, factors: k.factors }, { onConflict: "user_id,source,score_date" })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kscore"] }),
  })
}
