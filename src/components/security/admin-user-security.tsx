"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldCheckIcon, ShieldOffIcon, ShieldXIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

import { stepUp } from "./step-up"

type Security = { mfa: number; sessions: number; last_reset: string | null }

/**
 * /admin › user: 2FA status, signed-in devices, and the emergency 2FA reset
 * (only after confirming the person's identity through support).
 */
export function AdminUserSecurity({ userId, label }: { userId: string; label: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ["admin", "security", userId],
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("admin_user_security", { p_user_id: userId })
      if (error) throw error
      return data as Security
    },
  })
  const reset = useMutation({
    mutationFn: async (note: string) => {
      const { error } = await getSupabaseBrowserClient()!.rpc("admin_reset_mfa", { p_user_id: userId, p_note: note })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t("mfa.adminResetDone"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "security", userId] })
    },
    onError: () => toast.error(t("common.error")),
  })

  const onReset = async () => {
    const note = window.prompt(t("mfa.adminResetPrompt", { name: label }))
    if (note === null) return
    if (note.trim().length < 3) return void toast.error(t("mfa.adminResetNoteRequired"))
    if (!(await stepUp(t("mfa.adminReset")))) return
    reset.mutate(note.trim())
  }

  const on = (data?.mfa ?? 0) > 0
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center gap-2 text-sm">
        {on ? <ShieldCheckIcon className="size-4 text-emerald-600" aria-hidden /> : <ShieldOffIcon className="size-4 text-muted-foreground" aria-hidden />}
        <span className="flex-1">{data ? t(on ? "mfa.adminOn" : "mfa.adminOff", { devices: data.sessions }) : "…"}</span>
      </div>
      {data?.last_reset && <p className="text-xs text-muted-foreground">{t("mfa.adminLastReset", { date: new Date(data.last_reset).toLocaleString("en-GB") })}</p>}
      {on && (
        <Button size="sm" variant="outline" className="w-full text-destructive" onClick={onReset} disabled={reset.isPending}>
          <ShieldXIcon />
          {t("mfa.adminReset")}
        </Button>
      )}
    </div>
  )
}
