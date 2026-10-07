"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BellIcon, BotIcon, ChartColumnIcon, CheckCircle2Icon, CrownIcon, Loader2Icon, MessageSquarePlusIcon, MoonStarIcon, NotebookPenIcon, SendIcon, UnlinkIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useWorkspaces } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { showUpgrade, usePlan } from "@/lib/plan"
import { PROVINCES } from "@/lib/prayer"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"
import { pick } from "@/lib/i18n/dictionaries"

type Link = {
  chat_id: number
  username: string | null
  language: "km" | "en" | "zh"
  debt_alerts: boolean
  /** Sunday-evening spending digest (opt-in: it puts weekly totals in the chat). */
  weekly_digest: boolean
  /** /ai may use this account's figures (opt-in: answers put them in the chat). */
  ai_numbers?: boolean
  /** Buddhist holy days (ថ្ងៃសីល), the evening before. */
  holy_day_alerts: boolean
  evening_checkin?: boolean
  prayer_alerts: boolean
  prayer_province: string | null
  commands_enabled: boolean
  workspace_id: string | null
  /** ULTRA: log into every workspace, routed per message. */
  route_all: boolean
}

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

/** The official bot's username once an admin activated it (null otherwise). */
export function useOfficialBot() {
  return useQuery({
    queryKey: ["official-bot"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await client().from("app_settings").select("value").eq("key", "telegram_bot").maybeSingle()
      return ((data?.value as { username?: string } | null)?.username ?? null) as string | null
    },
  })
}

/** Select value for ULTRA's "all workspaces" routing. */
const ALL = "__all__"
const WS_ICON = { PERSONAL: "👤", BUSINESS: "🏪", FAMILY: "👨‍👩‍👧" } as const

export function useTelegramLink() {
  const userId = useSessionStore((s) => s.user?.id ?? null)
  return useQuery({
    queryKey: ["telegram-link", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      // Before the bot migration the table is missing: treat as "not linked".
      const { data, error } = await client().from("telegram_links").select("chat_id, username, language, debt_alerts, weekly_digest, ai_numbers, holy_day_alerts, evening_checkin, prayer_alerts, prayer_province, commands_enabled, workspace_id, route_all").maybeSingle()
      return error ? null : (data as Link | null)
    },
  })
}

/**
 * Settings › Telegram: connect the official @LuyChlat_bot in two taps (a
 * one-time code opens the bot, "Start" links the chat), then choose what it
 * sends. The personal-bot setup stays available under "Advanced".
 */
export function OfficialBotCard({ legacy }: { legacy: React.ReactNode }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const queryClient = useQueryClient()
  const bot = useOfficialBot()
  const link = useTelegramLink()
  const [waiting, setWaiting] = useState(false)
  const linked = link.data ?? null
  const { isPro, isUltra } = usePlan()
  // Prayer-time messages belong to Islamic Mode; still shown while on, so they can be turned off.
  const islamic = useIslamicEnabled()
  const workspaces = useWorkspaces()
  // Workspaces the bot may write to (owner or member, not archived).
  const writable = (workspaces.data ?? []).filter((w) => w.role !== "VIEWER" && !w.archived_at)
  const personalId = writable.find((w) => w.type === "PERSONAL" && w.role === "OWNER")?.id ?? ""
  const targetValue = isUltra && linked?.route_all ? ALL : (linked?.workspace_id ?? personalId)
  const pickTarget = (v: string) => {
    if (v === targetValue) return
    // "All workspaces" is ULTRA; the database ignores it on other plans anyway.
    if (v === ALL) return isUltra ? update.mutate({ route_all: true }) : showUpgrade("business")
    update.mutate({ workspace_id: v, route_all: false })
  }

  // After opening Telegram, check every few seconds until the chat is linked.
  useEffect(() => {
    if (!waiting || linked) return
    const id = window.setInterval(() => void link.refetch(), 3000)
    const stop = window.setTimeout(() => setWaiting(false), 3 * 60_000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(stop)
    }
  }, [waiting, linked, link])
  useEffect(() => {
    if (waiting && linked) {
      setWaiting(false)
      toast.success(t("bot.connected"))
    }
  }, [waiting, linked, t])

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await client().rpc("create_telegram_link_code")
      if (error) throw error
      return data as string
    },
    onSuccess: (code) => {
      setWaiting(true)
      window.open(`https://t.me/${bot.data}?start=${code}`, "_blank", "noopener,noreferrer")
    },
    onError: () => toast.error(t("common.error")),
  })

  const update = useMutation({
    mutationFn: async (patch: Partial<Link>) => {
      const { error } = await client().from("telegram_links").update(patch).not("chat_id", "is", null)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["telegram-link"] }),
    onError: () => toast.error(t("common.error")),
  })
  const unlink = useMutation({
    mutationFn: async () => {
      const { error } = await client().from("telegram_links").delete().not("chat_id", "is", null)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["telegram-link"] })
      toast.success(t("bot.disconnected"))
    },
  })

  // No official bot yet (or before the migration): only the personal-bot setup.
  if (!bot.data) return <>{legacy}</>

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">Telegram</h2>
      <Card className="gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <SendIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">@{bot.data}</p>
            <p className="text-xs text-muted-foreground">
              {linked ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-3.5" aria-hidden />
                  {t("bot.linkedTo", { name: linked.username ? `@${linked.username}` : t("bot.yourChat") })}
                </span>
              ) : (
                t("bot.intro")
              )}
            </p>
          </div>
        </div>

        {!linked ? (
          <>
            <Button className="h-11 bg-sky-500 text-white hover:bg-sky-600" onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending || waiting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              {t(waiting ? "bot.waiting" : "bot.connect")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("bot.connectHint")}</p>
          </>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <BellIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("bot.dueAlerts")}</span>
                <span className="block text-xs text-muted-foreground">{t("bot.dueAlertsHint")}</span>
              </span>
              <Switch checked={linked.debt_alerts} onCheckedChange={(v) => update.mutate({ debt_alerts: v })} aria-label={t("bot.dueAlerts")} />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <ChartColumnIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("bot.weeklyDigest")}</span>
                <span className="block text-xs text-muted-foreground">{t("bot.weeklyDigestHint")}</span>
                {linked.weekly_digest && <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">{t("bot.weeklyDigestWarn")}</span>}
              </span>
              <Switch checked={linked.weekly_digest} onCheckedChange={(v) => update.mutate({ weekly_digest: v })} aria-label={t("bot.weeklyDigest")} />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <BotIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("bot.aiNumbers")}</span>
                <span className="block text-xs text-muted-foreground">{t("bot.aiNumbersHint")}</span>
                {linked.ai_numbers && <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">{t("bot.aiNumbersWarn")}</span>}
              </span>
              <Switch checked={linked.ai_numbers ?? false} onCheckedChange={(v) => update.mutate({ ai_numbers: v })} aria-label={t("bot.aiNumbers")} />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-4 shrink-0 text-center text-sm" aria-hidden>
                🙏
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("bot.holyDayAlerts")}</span>
                <span className="block text-xs text-muted-foreground">{t("bot.holyDayAlertsHint")}</span>
              </span>
              <Switch checked={Boolean(linked.holy_day_alerts)} onCheckedChange={(v) => update.mutate({ holy_day_alerts: v })} aria-label={t("bot.holyDayAlerts")} />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <NotebookPenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("bot.eveningCheckin")}</span>
                <span className="block text-xs text-muted-foreground">{t("bot.eveningCheckinHint")}</span>
              </span>
              <Switch checked={Boolean(linked.evening_checkin)} onCheckedChange={(v) => update.mutate({ evening_checkin: v })} aria-label={t("bot.eveningCheckin")} />
            </label>
            {(islamic || linked.prayer_alerts) && (
              <label className="flex items-center gap-3 text-sm">
                <MoonStarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t("bot.prayerAlerts")}</span>
                  <span className="block text-xs text-muted-foreground">{t("bot.prayerAlertsHint")}</span>
                </span>
                <Switch
                  checked={linked.prayer_alerts}
                  onCheckedChange={(v) => update.mutate({ prayer_alerts: v, prayer_province: linked.prayer_province ?? "phnom_penh" })}
                  aria-label={t("bot.prayerAlerts")}
                />
              </label>
            )}
            {linked.prayer_alerts && (
              <Select value={linked.prayer_province ?? "phnom_penh"} onValueChange={(v) => update.mutate({ prayer_province: v })}>
                <SelectTrigger className="h-10 w-full" aria-label={t("prayer.location")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVINCES.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {pick(p, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-3 text-sm">
              <MessageSquarePlusIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  {t("bot.commands")}
                  {!isPro && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      <CrownIcon className="size-3" aria-hidden />
                      PRO
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{t("bot.commandsHint")}</span>
              </span>
              <Switch
                checked={isPro && linked.commands_enabled}
                onCheckedChange={(v) => (isPro ? update.mutate({ commands_enabled: v }) : showUpgrade("general"))}
                aria-label={t("bot.commands")}
              />
            </label>
            {isPro && linked.commands_enabled && (
              <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                {writable.length > 1 && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex-1">{t("bot.commandsWorkspace")}</span>
                    {writable.length <= 2 ? (
                      <Segmented
                        aria-label={t("bot.commandsWorkspace")}
                        value={targetValue}
                        onChange={pickTarget}
                        disabled={update.isPending}
                        options={[
                          ...writable.map((w) => ({
                            value: w.id,
                            label: <span className="block truncate px-1">{`${WS_ICON[w.type]} ${w.name}`}</span>,
                          })),
                          { value: ALL, label: <span className="block truncate px-1">👑 {t("bot.routeAllShort")}</span> },
                        ]}
                      />
                    ) : (
                    <Select value={targetValue} onValueChange={pickTarget}>
                      <SelectTrigger className="h-9 w-44" aria-label={t("bot.commandsWorkspace")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {writable.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={ALL}>
                          <span className="flex items-center gap-1.5">
                            {t("bot.routeAll")}
                            <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">ULTRA</span>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    )}
                  </div>
                )}
                {writable.length > 1 && isUltra && linked.route_all && <p className="text-xs text-muted-foreground">{t("bot.routeAllHint")}</p>}
                <p className="text-xs text-muted-foreground">{t("bot.commandsVoice")}</p>
                <p className="text-xs text-muted-foreground">{t("bot.commandsWarn")}</p>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <span className="flex-1">{t("telegram.language")}</span>
              <div className="w-40">
                <Segmented
                  aria-label={t("telegram.language")}
                  value={linked.language}
                  onChange={(v) => update.mutate({ language: v as "km" | "en" | "zh" })}
                  options={[
                    { value: "km", label: "ខ្មែរ" },
                    { value: "en", label: "EN" },
                    { value: "zh", label: "中文" },
                  ]}
                />
              </div>
            </div>
            <Button variant="outline" className="w-full text-destructive" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              <UnlinkIcon />
              {t("bot.disconnect")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("bot.privacy")}</p>
          </div>
        )}
      </Card>

      <details className="rounded-xl border px-4 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">{t("bot.advanced")}</summary>
        <div className="pt-3">{legacy}</div>
      </details>
    </section>
  )
}
