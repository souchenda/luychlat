"use client"

import { useQueryClient } from "@tanstack/react-query"
import { BotIcon, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useOfficialBot } from "@/components/settings/official-bot"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * /admin › System health: (re)activate the official bot — checks
 * TELEGRAM_BOT_TOKEN, stores the bot key's hash (as you) and points Telegram's
 * webhook at this site. Deploys do this automatically; safe to press any time.
 */
export function ReactivateBotButton({ onDone }: { onDone?: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const bot = useOfficialBot()
  const [busy, setBusy] = useState(false)

  const activate = async () => {
    setBusy(true)
    try {
      const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session
      const res = await fetch("/api/telegram/activate", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } })
      const body = (await res.json()) as { username?: string; webhook?: string | null; webhookError?: string | null; error?: string }
      if (!res.ok) return void toast.error(t(body.error === "no_token" ? "bot.adminNoToken" : body.error === "bad_token" ? "bot.adminBadToken" : "common.error"))
      if (!body.webhook) toast.error(t("bot.adminWebhookFailed", { reason: body.webhookError ?? "" }))
      else toast.success(t("bot.adminActivated", { name: body.username ?? "" }))
      void queryClient.invalidateQueries({ queryKey: ["official-bot"] })
      onDone?.()
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant="outline" className="h-8" onClick={() => void activate()} disabled={busy} title={t("bot.adminHint")}>
      {busy ? <Loader2Icon className="animate-spin" /> : <BotIcon />}
      {t(bot.data ? "bot.adminReactivate" : "bot.adminActivate")}
    </Button>
  )
}
