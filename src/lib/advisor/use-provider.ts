"use client"

import { useQuery } from "@tanstack/react-query"

import { usePlan } from "@/lib/plan"
import { effectiveProvider, useAiStore, type AiProvider } from "@/stores/ai-store"

/** Whether the server's own AI (LuyChlat AI) is configured — GET /api/advisor. */
function useServerAi(): boolean {
  return (
    useQuery({
      queryKey: ["advisor-server-ai"],
      staleTime: 10 * 60_000,
      queryFn: async () => {
        const res = await fetch("/api/advisor")
        const data = (await res.json().catch(() => null)) as { luysmart?: boolean } | null
        return Boolean(data?.luysmart)
      },
    }).data === true
  )
}

/** The advisor's provider for this person now (lib/stores/ai-store effectiveProvider). */
export function useAdvisorProvider(): AiProvider {
  const ai = useAiStore()
  const { isPro } = usePlan()
  const serverAi = useServerAi()
  return effectiveProvider(ai, { isPro, serverAi })
}
