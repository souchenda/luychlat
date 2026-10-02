"use client"

import { useQueryClient } from "@tanstack/react-query"
import { BotIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useOfficialBot } from "@/components/settings/official-bot"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * /admin: activate the official bot after TELEGRAM_BOT_TOKEN is set on the
 * server. The server checks the token, stores the bot key's hash (as you),
 * and points Telegram at this site. Safe to press again (e.g. after a new token).
 */
export function BotAdminCard() {
  const t = useT()
  const queryClient = useQueryClient()
  const bot = useOfficialBot()
  const [busy, setBusy] = useState(false)
  const [webhook, setWebhook] = useState<string | null>(null)

  const activate = async () => {
    setBusy(true)
    try {
      const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session
      const res = await fetch("/api/telegram/activate", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } })
      const body = (await res.json()) as { username?: string; webhook?: string | null; webhookError?: string | null; error?: string }
      if (!res.ok) return void toast.error(t(body.error === "no_token" ? "bot.adminNoToken" : body.error === "bad_token" ? "bot.adminBadToken" : "common.error"))
      setWebhook(body.webhook ?? null)
      if (!body.webhook) toast.error(t("bot.adminWebhookFailed", { reason: body.webhookError ?? "" }))
      else toast.success(t("bot.adminActivated", { name: body.username ?? "" }))
      void queryClient.invalidateQueries({ queryKey: ["official-bot"] })
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
        <BotIcon className="size-4" aria-hidden />
        {t("bot.adminTitle")}
      </h2>
      <Card className="gap-3 px-4 py-4">
        <p className="text-sm">
          {bot.data ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2Icon className="size-4" aria-hidden />
              {t("bot.adminActive", { name: bot.data })}
            </span>
          ) : (
            t("bot.adminInactive")
          )}
        </p>
        {webhook && <p className="font-mono text-[11px] break-all text-muted-foreground">{webhook}</p>}
        <Button onClick={() => void activate()} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <BotIcon />}
          {t(bot.data ? "bot.adminReactivate" : "bot.adminActivate")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("bot.adminHint")}</p>
      </Card>
    </section>
  )
}
