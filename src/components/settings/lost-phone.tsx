"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, SirenIcon } from "lucide-react"
import { toast } from "sonner"

import { SettingsRow } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** «🚨 My phone is lost» (founder, 28/10/2026): every other device signed out and the Telegram bot unlinked — public.secure_lost_phone(). */
function useSecureLostPhone() {
  const t = useT()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("secure_lost_phone")
      if (error) throw error
      return data as { sessions: number; telegram: number }
    },
    onSuccess: () => {
      toast.success(t("lost.done"), { duration: 8000 })
      void queryClient.invalidateQueries()
    },
    onError: () => toast.error(t("common.error")),
  })
}

const ask = (t: ReturnType<typeof useT>) => window.confirm(t("lost.confirm"))

/** The big button on /lost. */
export function LostPhoneButton() {
  const t = useT()
  const secure = useSecureLostPhone()
  return (
    <Button type="button" variant="destructive" className="h-12 w-full gap-2 rounded-xl text-base" disabled={secure.isPending} onClick={() => ask(t) && secure.mutate()}>
      {secure.isPending ? <Loader2Icon className="size-5 animate-spin" aria-hidden /> : <SirenIcon className="size-5" aria-hidden />}
      {t("lost.button")}
    </Button>
  )
}

/** Settings › Security, last: the same action. */
export function LostPhoneRow() {
  const t = useT()
  const secure = useSecureLostPhone()
  return (
    <SettingsRow
      icon={secure.isPending ? <Loader2Icon className="animate-spin" /> : <SirenIcon />}
      tile="rose"
      title={t("lost.button")}
      hint={t("lost.hint")}
      onClick={() => {
        if (!secure.isPending && ask(t)) secure.mutate()
      }}
    />
  )
}
