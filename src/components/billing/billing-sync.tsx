"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"

import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Signed-in only: marks the user active (for admin DAU/MAU) and refreshes the
 * plan as soon as an admin approves a payment or changes the subscription.
 */
export function BillingSync() {
  const t = useT()
  const userId = useSessionStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !userId) return
    void supabase.rpc("touch_last_seen")

    const filter = `user_id=eq.${userId}`
    const channel = supabase
      .channel(`billing:${userId}`)
      .on("postgres_changes", { schema: "public", table: "subscriptions", event: "*", filter }, () => {
        void queryClient.invalidateQueries({ queryKey: ["plan"] })
      })
      .on("postgres_changes", { schema: "public", table: "payments", event: "UPDATE", filter }, (payload) => {
        const row = payload.new as { status?: string; method?: string }
        const status = row.status
        // KHQR checkouts celebrate on their own screen.
        if (status === "PAID" && row.method !== "KHQR") toast.success(t("upgrade.approved"))
        if (status === "REJECTED") toast.error(t("upgrade.rejected"))
        void queryClient.invalidateQueries({ queryKey: ["payments-mine"] })
        void queryClient.invalidateQueries({ queryKey: ["plan"] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient, t])

  return null
}
