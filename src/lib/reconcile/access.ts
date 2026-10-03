"use client"

import { useQuery } from "@tanstack/react-query"

import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

export const importCreditKey = (userId: string | null) => ["statement-import-credit", userId] as const

/**
 * Who may import a bank statement: as many times as the plan allows
 * (plans.max_statement_imports, set in /admin/super; null = unlimited, PRO and
 * Ultra) — FREE gets 1 by default, the onboarding hook. The database enforces
 * it in import_statement.
 */
export function useImportAccess() {
  const { plan, isPro, loading: planLoading } = usePlan()
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const credit = useQuery({
    queryKey: importCreditKey(userId),
    enabled: Boolean(userId) && !planLoading && !isPro,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return { used: true }
      const [{ data, error }, { data: limits }] = await Promise.all([
        supabase.from("statement_import_credits").select("used_count").maybeSingle(),
        supabase.from("plans").select("max_statement_imports").eq("code", plan.plan_code).maybeSingle(),
      ])
      if (error) throw error
      const row = limits as { max_statement_imports: number | null } | null
      if (row && row.max_statement_imports === null) return { used: false } // unlimited on this plan
      return { used: (data?.used_count ?? 0) >= (row?.max_statement_imports ?? 1) }
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
