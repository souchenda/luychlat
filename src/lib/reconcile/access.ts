"use client"

import { useQuery } from "@tanstack/react-query"

import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

export const importCreditKey = (userId: string | null) => ["statement-import-credit", userId] as const

/**
 * Who may import a bank statement: PRO/Ultra always; a FREE account once (the
 * onboarding hook — the database enforces it in import_statement).
 */
export function useImportAccess() {
  const { isPro, loading: planLoading } = usePlan()
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const credit = useQuery({
    queryKey: importCreditKey(userId),
    enabled: Boolean(userId) && !planLoading && !isPro,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return { used: true }
      const { data, error } = await supabase.from("statement_import_credits").select("used_at").maybeSingle()
      if (error) throw error
      return { used: Boolean(data) }
    },
  })
  // If the check fails (e.g. offline), behave as before: PRO only.
  const freeLeft = !isPro && credit.isSuccess && !credit.data.used
  return {
    isPro,
    freeLeft,
    freeUsed: !isPro && credit.isSuccess && credit.data.used,
    allowed: isPro || freeLeft,
    loading: planLoading || (!isPro && credit.isLoading),
  }
}
