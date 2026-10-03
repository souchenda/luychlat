"use client"

import { useQuery } from "@tanstack/react-query"
import { ActivityIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { adminPost } from "@/components/admin/admin-api"
import { ReactivateBotButton } from "@/components/settings/bot-admin"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import type { LocalGold } from "@/lib/local-gold"
import { cn } from "@/lib/utils"

type Status = {
  now: string
  latest_sample: { at: string; ok: boolean; ram_pct: number | null; cpu_pct: number | null; disk_pct: number | null; app_mem_pct: number | null; db_ms: number | null; issues: string[] } | null
  uptime_7d: number | null
  samples_7d: number
  bulletin_runs: { day: string; ran_at: string }[]
  weekly_health_last: string | null
  linked_chats: number
  admins_linked: number
  events: { id: number; at: string; level: "info" | "warn" | "error" | "security"; source: string; message: string; count: number }[]
  security_24h: number
  errors_24h: number
  server: { started_at: string; uptime_s: number; rss_mb: number; node: string; dispatcher: boolean }
  database: { ok: boolean; ms: number; error: string | null }
  telegram: { ok: boolean; ms: number; username: string | null; webhook_url: string | null; pending: number | null; last_error_at: string | null; last_error: string | null; community_chat: string | null; voice: boolean }
  feeds: { fetched_at: string | null; nbc: { date: string; usd_khr: number } | null; gold_spot: { spot: number; updated_at: string } | null; local_gold: LocalGold | null }
}

type Tone = "ok" | "warn" | "bad" | "off"
const DOT: Record<Tone, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", off: "bg-muted-foreground/40" }

const ago = (iso: string | null | undefined, now: number) => {
  if (!iso) return "—"
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 90) return `${s}s`
  if (s < 5400) return `${Math.round(s / 60)}m`
  if (s < 172_800) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86_400)}d`
}
const duration = (s: number) => (s >= 86_400 ? `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`)
const phnomPenh = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000)
const ppDay = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10)

function Row({ tone, label, value, hint }: { tone: Tone; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm">{label}</span>
          <span className="text-right text-sm font-medium tabular-nums">{value}</span>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  )
}

const LEVEL: Record<Status["events"][number]["level"], { icon: string; className: string }> = {
  info: { icon: "ℹ️", className: "" },
  warn: { icon: "⚠️", className: "text-amber-700 dark:text-amber-400" },
  error: { icon: "❌", className: "text-red-600 dark:text-red-400" },
  security: { icon: "🛡️", className: "text-violet-700 dark:text-violet-300" },
}

/** /admin › System health & bot security (24/7): server, database, feeds, bot, bulletin and the event log. */
export function SystemHealthCard() {
  const t = useT()
  const q = useQuery({
    queryKey: ["admin-system"],
    queryFn: () => adminPost<Status>("/api/admin/system"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const s = q.data
  const now = s ? Date.parse(s.now) : Date.now()
  const today = ppDay(now)
  const hourPP = phnomPenh(new Date(now).toISOString()).getUTCHours()

  const sample = s?.latest_sample
  const nbcAgeDays = s?.feeds.nbc ? (now - Date.parse(`${s.feeds.nbc.date}T00:00:00+07:00`)) / 86_400_000 : null
  const local = s?.feeds.local_gold
  const lastBulletin = s?.bulletin_runs[0]
  const sentToday = lastBulletin?.day === today
  const webhookErrRecent = s?.telegram.last_error_at ? now - Date.parse(s.telegram.last_error_at) < 3_600_000 : false

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ActivityIcon className="size-4" aria-hidden />
          {t("sys.title")}
        </h2>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => void q.refetch()} disabled={q.isFetching} aria-label={t("market.refresh")}>
          {q.isFetching ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        </Button>
      </div>
      <Card className="gap-4 px-4 py-4">
        {q.isLoading && <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {q.isError && <p className="text-sm text-destructive">{t("sys.unavailable")}</p>}
        {s && (
          <>
            <Group title={t("sys.appDb")}>
              <Row tone="ok" label={t("sys.webServer")} value={`Online · ${duration(s.server.uptime_s)}`} hint={`${t("sys.since")} ${phnomPenh(s.server.started_at).toISOString().slice(0, 16).replace("T", " ")} · ${s.server.rss_mb} MB · Node ${s.server.node}`} />
              <Row
                tone={s.database.ok ? (s.database.ms > 1500 ? "warn" : "ok") : "bad"}
                label="Supabase"
                value={s.database.ok ? `Connected · ${s.database.ms} ms` : "Down"}
                hint={s.database.error ?? undefined}
              />
              <Row
                tone={s.uptime_7d == null ? "off" : s.uptime_7d >= 99 ? "ok" : s.uptime_7d >= 95 ? "warn" : "bad"}
                label={t("sys.uptime7d")}
                value={s.uptime_7d != null ? `${s.uptime_7d}%` : "—"}
                hint={t("sys.samples", { n: s.samples_7d })}
              />
              {sample && (
                <Row
                  tone={sample.ok ? "ok" : "warn"}
                  label={t("sys.resources")}
                  value={`RAM ${sample.ram_pct ?? "–"}% · CPU ${sample.cpu_pct ?? "–"}% · Disk ${sample.disk_pct ?? "–"}%`}
                  hint={`${t("sys.appMemory")} ${sample.app_mem_pct ?? "–"}% · ${ago(sample.at, now)} ${t("sys.ago")}${sample.issues.length ? ` · ${sample.issues.join(", ")}` : ""}`}
                />
              )}
            </Group>

            <Group title={t("sys.feeds")}>
              <Row
                tone={!s.feeds.nbc ? "bad" : (nbcAgeDays ?? 9) <= 3.5 ? "ok" : "warn"}
                label={t("sys.nbc")}
                value={s.feeds.nbc ? `$1 = ${s.feeds.nbc.usd_khr.toLocaleString("en-US")}៛` : "—"}
                hint={s.feeds.nbc ? `${t("sys.published")} ${s.feeds.nbc.date} · ${t("sys.checked")} ${ago(s.feeds.fetched_at, now)} ${t("sys.ago")}` : undefined}
              />
              <Row
                tone={!local ? "bad" : local.date === today ? "ok" : hourPP < 11 ? "warn" : "bad"}
                label={t("sys.csnj")}
                value={local ? `${local.kilo.sell.toLocaleString("en-US")} / ${local.kilo.buy.toLocaleString("en-US")}` : "—"}
                hint={
                  local
                    ? `${local.date}${local.source === "manual" ? ` · ${t("sys.manual")}` : ""}${local.date !== today ? ` · ${t(hourPP < 11 ? "sys.csnjWaiting" : "sys.csnjMissing")}` : ""}`
                    : t("sys.csnjWaiting")
                }
              />
              <Row
                tone={s.feeds.gold_spot && s.feeds.fetched_at && now - Date.parse(s.feeds.fetched_at) < 2 * 3_600_000 ? "ok" : "warn"}
                label={t("sys.goldSpot")}
                value={s.feeds.gold_spot ? `$${s.feeds.gold_spot.spot.toLocaleString("en-US")}/oz` : "—"}
                hint={s.feeds.gold_spot ? `${ago(s.feeds.gold_spot.updated_at, now)} ${t("sys.ago")}` : undefined}
              />
            </Group>

            <Group title={t("sys.bot")}>
              <Row
                tone={!s.telegram.ok ? "bad" : webhookErrRecent || (s.telegram.pending ?? 0) > 20 ? "warn" : "ok"}
                label={s.telegram.username ? `@${s.telegram.username}` : "Telegram bot"}
                value={s.telegram.ok ? `Active · ${s.telegram.ms} ms` : "Offline"}
                hint={`Webhook ${s.telegram.webhook_url ? new URL(s.telegram.webhook_url).host : "—"} · ${t("sys.pending", { n: s.telegram.pending ?? 0 })}${s.telegram.last_error ? ` · ${t("sys.lastError")} ${ago(s.telegram.last_error_at, now)} ${t("sys.ago")}: ${s.telegram.last_error}` : ""}`}
              />
              <Row tone={s.server.dispatcher ? "ok" : "bad"} label={t("sys.scheduler")} value={s.server.dispatcher ? t("sys.running") : t("sys.stopped")} hint={t("sys.schedulerHint")} />
              <Row
                tone={!s.telegram.community_chat ? "off" : sentToday ? "ok" : hourPP >= 11 ? "bad" : "warn"}
                label={t("sys.bulletin")}
                value={sentToday ? `${t("sys.sentAt")} ${phnomPenh(lastBulletin!.ran_at).toISOString().slice(11, 16)}` : s.telegram.community_chat ? t("sys.notYet") : t("sys.off")}
                hint={`${s.telegram.community_chat ?? "—"} · ${t(sentToday || hourPP >= 11 ? "sys.nextTomorrow" : "sys.nextToday")}${lastBulletin && !sentToday ? ` · ${t("sys.lastSent")} ${lastBulletin.day}` : ""}`}
              />
              <Row tone="ok" label={t("sys.links")} value={`${s.linked_chats}`} hint={t("sys.linksHint", { admins: s.admins_linked })} />
              <Row tone={s.telegram.voice ? "ok" : "off"} label={t("sys.voice")} value={s.telegram.voice ? t("sys.on") : t("sys.off")} />
              <div className="pt-1.5">
                <ReactivateBotButton onDone={() => void q.refetch()} />
              </div>
            </Group>

            <Group title={t("sys.security")}>
              <div className="mb-1 flex gap-2 text-xs">
                <span className={cn("rounded-full px-2 py-0.5", s.security_24h ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-muted text-muted-foreground")}>
                  🛡️ {t("sys.security24h", { n: s.security_24h })}
                </span>
                <span className={cn("rounded-full px-2 py-0.5", s.errors_24h ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground")}>
                  ❌ {t("sys.errors24h", { n: s.errors_24h })}
                </span>
              </div>
              {s.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("sys.noEvents")}</p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border text-xs">
                  {s.events.map((e) => (
                    <li key={e.id} className={cn("flex gap-2 px-2.5 py-1.5", LEVEL[e.level].className)}>
                      <span aria-hidden>{LEVEL[e.level].icon}</span>
                      <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{ago(e.at, now)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{e.source}</span> · {e.message}
                        {e.count > 1 && <span className="text-muted-foreground"> (×{e.count})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Group>
          </>
        )}
      </Card>
    </section>
  )
}


