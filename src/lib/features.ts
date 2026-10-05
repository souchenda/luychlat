"use client"

import { useQuery } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Feature flags (public.feature_flags): a feature in testing is ADMIN_ONLY —
 * only staff and 🧪 test accounts see it in the menu, open its pages and use
 * its bot commands. Super admins flip them in /admin/super.
 */
export const FEATURES = {
  invoices: { routes: ["/invoices"], emoji: "🧾" },
  gifts: { routes: ["/gifts"], emoji: "🎁" },
  pools: { routes: ["/pools"], emoji: "👥" },
  statement_import: { routes: ["/wallets/import"], emoji: "📄" },
} as const

export type FeatureKey = keyof typeof FEATURES
export type FeatureStatus = "PUBLIC" | "ADMIN_ONLY" | "DISABLED"
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]

/** The gated feature a path belongs to, if any. */
export function featureOfPath(pathname: string): FeatureKey | null {
  for (const key of FEATURE_KEYS) {
    if (FEATURES[key].routes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return key
  }
  return null
}

/** Which features this account may use. `ready` is false until known (gated items stay hidden meanwhile). */
export function useFeatures() {
  const userId = useSessionStore((s) => s.user?.id)
  const query = useQuery({
    queryKey: ["features", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("my_features")
      if (error) throw error
      return (data ?? {}) as Partial<Record<string, boolean>>
    },
  })
  const map = query.data
  return {
    ready: Boolean(map),
    /** Unknown keys (not in the table) are public; while loading, gated ones are not. */
    allowed: (key: FeatureKey) => (map ? map[key] !== false : false),
  }
}
