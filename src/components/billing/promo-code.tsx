"use client"

import { useMutation } from "@tanstack/react-query"
import { format } from "date-fns"
import { TicketIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useRefreshPlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type PromoResult = {
  status: "ok" | "invalid" | "expired" | "used_up" | "already_redeemed" | "new_users_only" | "rate_limited"
  days?: number
  plan_code?: string
  period_end?: string
}

/** Settings › plan: "Have a promo code?" — free days of PRO / ULTRA (redeem_promo checks everything). */
export function PromoCodeRow() {
  const t = useT()
  const refreshPlan = useRefreshPlan()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const redeem = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("redeem_promo", { p_code: code })
      if (error) throw error
      return data as PromoResult
    },
    onSuccess: (r) => {
      if (r.status !== "ok") return void toast.error(t(`promo.error.${r.status}` as MessageKey))
      toast.success(
        t("promo.redeemed", {
          days: r.days ?? 0,
          tier: r.plan_code?.startsWith("ULTRA") ? "ULTRA" : "PRO",
          date: r.period_end ? format(new Date(r.period_end), "dd/MM/yyyy") : "",
        }),
      )
      setCode("")
      setOpen(false)
      void refreshPlan()
    },
    onError: () => toast.error(t("common.error")),
  })

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-1 text-xs font-medium text-primary [&_svg]:size-3.5">
        <TicketIcon />
        {t("promo.have")}
      </button>
    )
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.replace(/[^A-Za-z0-9]/g, "").length >= 4) redeem.mutate()
      }}
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t("promo.placeholder")}
        aria-label={t("promo.placeholder")}
        maxLength={24}
        autoCapitalize="characters"
        autoFocus
        className="font-mono"
      />
      <Button type="submit" variant="secondary" disabled={redeem.isPending}>
        {t("promo.apply")}
      </Button>
    </form>
  )
}
