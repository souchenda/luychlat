"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleDotIcon,
  Loader2Icon,
  PaintbrushIcon,
  PlayIcon,
  PlusIcon,
  ShieldAlertIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DEV_AREA_KEYS as AREA_KEYS, groupByArea } from "@/lib/dev-areas"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Commit = { hash: string; deployed_at: string; committed_at: string; kind: string; scope: string | null; subject: string; body: string | null }
type RoadmapItem = { id: string; title: string; details: string | null; area: string; status: "todo" | "doing" | "done" | "dropped"; priority: number; done_at: string | null }

const KIND_ICON: Record<string, LucideIcon> = { feat: SparklesIcon, fix: WrenchIcon, style: PaintbrushIcon, chore: PaintbrushIcon }

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}
const ppDate = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
const ppTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/**
 * Super Admin › Development: what shipped on a day or range (recorded from git
 * by each deploy, grouped by area) and the roadmap of what's next — the same
 * content as the 23:59 end-of-day report sent to super admins in Telegram.
 */
export default function DevChangelogPage() {
  const t = useT()
  const { plan, loading } = usePlan()
  const today = ppDate(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)

  if (loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (plan.staff_role !== "super_admin") {
    return (
      <Card className="items-center gap-2 px-6 py-10 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("admin.forbidden")}</p>
      </Card>
    )
  }

  const preset = (days: number) => {
    setTo(today)
    setFrom(addDays(today, -(days - 1)))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/admin/super">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{t("dev.title")}</h1>
      </div>

      <Card className="gap-3 px-4 py-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("dev.from")}
            <Input type="date" className="h-10" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            {t("dev.to")}
            <Input type="date" className="h-10" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["dev.today", () => preset(1)],
              ["dev.yesterday", () => (setFrom(addDays(today, -1)), setTo(addDays(today, -1)))],
              ["dev.last7", () => preset(7)],
              ["dev.last30", () => preset(30)],
            ] as [MessageKey, () => void][]
          ).map(([label, run]) => (
            <button key={label} type="button" onClick={run} className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/70">
              {t(label)}
            </button>
          ))}
        </div>
      </Card>

      <Shipped from={from} to={to} today={today} />
      <Security from={from} to={to} today={today} />
      <Roadmap />
    </div>
  )
}

function Shipped({ from, to, today }: { from: string; to: string; today: string }) {
  const t = useT()
  // Today is live (00:00 → now): commits are recorded as each deploy finishes; refetched every minute.
  const live = to === today
  const query = useQuery({
    queryKey: ["dev-changelog", from, to],
    refetchInterval: live ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await client().rpc("dev_changelog_list", { p_from: from, p_to: to })
      if (error) throw error
      return (data ?? []) as Commit[]
    },
  })
  // A past single day: its 23:59 snapshot, when finalized.
  const final = useQuery({
    queryKey: ["dev-eod", from],
    enabled: from === to && !live,
    queryFn: async () => {
      const { data, error } = await client().rpc("dev_eod_report", { p_day: from })
      if (error) throw error
      return data as { finalized_at: string } | null
    },
  })
  const commits = useMemo(() => query.data ?? [], [query.data])
  const groups = useMemo(() => groupByArea(commits), [commits])
  const count = (kind: string) => commits.filter((c) => c.kind === kind).length
  const multiDay = from !== to

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">
          {t("dev.shipped")}
          {live && from === to && (
            <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">{t("dev.live", { now: ppTime(new Date(query.dataUpdatedAt || Date.now()).toISOString()) })}</span>
          )}
          {!live && final.data && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("dev.final", { at: ppTime(final.data.finalized_at) })}</span>}
        </h2>
        {commits.length > 0 && (
          <span className="text-xs text-muted-foreground">{t("dev.counts", { total: commits.length, feat: count("feat"), fix: count("fix") })}</span>
        )}
      </div>
      {query.isLoading ? (
        <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
      ) : query.isError ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-destructive">{t("common.error")}</p>
      ) : commits.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("dev.nothing")}</p>
      ) : (
        groups.map((g) => (
          <Card key={g.key} className="gap-0 overflow-hidden py-0">
            <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t(`dev.area.${g.key}` as MessageKey)} · {g.items.length}
            </p>
            <div className="divide-y">
              {g.items.map((c) => {
                const Icon = KIND_ICON[c.kind] ?? CircleDotIcon
                return (
                  <details key={c.hash} className="group px-4 py-2.5">
                    <summary className="flex cursor-pointer list-none items-start gap-2.5">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", c.kind === "feat" ? "text-emerald-600" : c.kind === "fix" ? "text-amber-600" : "text-muted-foreground")} aria-hidden />
                      <span className="min-w-0 flex-1 text-sm leading-snug">{c.subject}</span>
                      <span className="shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                        {multiDay && <span className="block">{ppDate(new Date(c.deployed_at)).slice(5).split("-").reverse().join("/")}</span>}
                        {ppTime(c.deployed_at)}
                      </span>
                    </summary>
                    <div className="mt-1.5 ml-6.5 space-y-1 text-xs text-muted-foreground">
                      <p className="font-mono">
                        {c.kind}
                        {c.scope ? `(${c.scope})` : ""} · {c.hash.slice(0, 7)}
                      </p>
                      {c.body && <p className="whitespace-pre-line">{c.body}</p>}
                    </div>
                  </details>
                )
              })}
            </div>
          </Card>
        ))
      )}
    </section>
  )
}

type SecuritySummary = {
  traffic: { total: number; blocked: number; limited: number; errors: number; peak_blocked_per_min: number; attack_minutes: number; first_blocked: string | null; last_blocked: string | null }
  health: { max_cpu: number | null; max_ram: number | null; ok_pct: number | null }
  incidents: { issue: string; started_at: string; ended_at: string | null; minutes: number; peak: number | null; note: string | null }[]
  now: { at: string; ok: boolean; cpu: number | null; ram: number | null; issues: string[] } | null
}
const fmt = (n: number) => Number(n).toLocaleString("en-US")

/** Blocked / rate-limited traffic (Nginx), CPU / RAM peaks, incidents with recovery time, and health now. */
function Security({ from, to, today }: { from: string; to: string; today: string }) {
  const t = useT()
  const live = to === today
  const query = useQuery({
    queryKey: ["dev-security", from, to],
    refetchInterval: live ? 60_000 : false,
    queryFn: async () => {
      const { data, error } = await client().rpc("dev_security_summary", { p_from: from, p_to: to })
      if (error) throw error
      return data as SecuritySummary
    },
  })
  const s = query.data
  if (query.isLoading) return null
  if (!s) return query.isError ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-destructive">{t("common.error")}</p> : null
  const tr = s.traffic
  const span = tr.first_blocked && tr.last_blocked ? `${ppTime(tr.first_blocked)}–${ppTime(tr.last_blocked)}` : ""

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">{t("dev.security")}</h2>
        {s.now && (
          <span className={cn("text-xs font-medium", s.now.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600")}>
            {s.now.ok ? t("dev.healthyNow", { cpu: s.now.cpu ?? "–", ram: s.now.ram ?? "–" }) : t("dev.issuesNow", { issues: s.now.issues.join(", ") })}
          </span>
        )}
      </div>
      <Card className="gap-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={cn("rounded-xl px-2 py-2", tr.blocked > 0 ? "bg-rose-50 dark:bg-rose-500/10" : "bg-muted/50")}>
            <p className="text-[11px] text-muted-foreground">{t("dev.blocked")}</p>
            <p className={cn("text-lg font-bold tabular-nums", tr.blocked > 0 && "text-rose-600")}>{fmt(tr.blocked)}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[11px] text-muted-foreground">{t("dev.maxCpu")}</p>
            <p className={cn("text-lg font-bold tabular-nums", (s.health.max_cpu ?? 0) >= 90 && "text-amber-600")}>{s.health.max_cpu ?? "–"}%</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[11px] text-muted-foreground">{t("dev.healthyPct")}</p>
            <p className="text-lg font-bold tabular-nums">{s.health.ok_pct ?? "–"}%</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("dev.trafficLine", { total: fmt(tr.total), limited: fmt(tr.limited), errors: fmt(tr.errors), ram: s.health.max_ram ?? "–" })}
          {tr.blocked > 0 && ` · ${t("dev.attackLine", { peak: fmt(tr.peak_blocked_per_min), minutes: tr.attack_minutes, window: span })}`}
        </p>
        {s.incidents.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            {s.incidents.map((i) => (
              <div key={i.started_at + i.issue} className="text-sm">
                <p className="font-medium">
                  {i.ended_at ? "✅" : "🔴"} {i.issue.toUpperCase()}
                  {i.peak != null && ` · ${t("dev.peak", { value: i.peak })}`}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {ppTime(i.started_at)} → {i.ended_at ? ppTime(i.ended_at) : t("dev.ongoing")} · {t("dev.recoveredIn", { minutes: i.minutes })}
                  {i.note ? ` · ${i.note}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

function Roadmap() {
  const t = useT()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [area, setArea] = useState("wallets")
  const [priority, setPriority] = useState("2")
  const items = useQuery({
    queryKey: ["dev-roadmap"],
    queryFn: async () => {
      const { data, error } = await client().rpc("dev_roadmap_list")
      if (error) throw error
      return (data ?? []) as RoadmapItem[]
    },
  })
  const save = useMutation({
    mutationFn: async (item: Partial<RoadmapItem>) => {
      const { error } = await client().rpc("dev_roadmap_save", { p_item: item })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dev-roadmap"] }),
    onError: () => toast.error(t("common.error")),
  })
  const open = (items.data ?? []).filter((i) => i.status === "todo" || i.status === "doing")
  const done = (items.data ?? []).filter((i) => i.status === "done")

  const add = () => {
    if (title.trim().length < 2) return
    save.mutate({ title: title.trim(), area, priority: Number(priority) }, { onSuccess: () => setTitle("") })
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold">{t("dev.roadmap")}</h2>
      <Card className="gap-0 overflow-hidden py-0">
        {open.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t("dev.roadmapEmpty")}</p>
        ) : (
          <div className="divide-y">
            {open.map((i) => (
              <div key={i.id} className="flex items-start gap-2.5 px-4 py-3">
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", i.priority === 1 ? "bg-rose-500" : i.priority === 2 ? "bg-amber-500" : "bg-slate-300")}
                  aria-label={t("dev.priority", { n: i.priority })}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm leading-snug", i.status === "doing" && "font-semibold")}>
                    {i.status === "doing" && <span className="mr-1 text-amber-600">▶</span>}
                    {i.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`dev.area.${i.area}` as MessageKey)}
                    {i.details ? ` · ${i.details}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  {i.status === "todo" && (
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => save.mutate({ id: i.id, status: "doing" })} aria-label={t("dev.start")}>
                      <PlayIcon className="size-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="size-8 text-emerald-700" onClick={() => save.mutate({ id: i.id, status: "done" })} aria-label={t("dev.markDone")}>
                    <CheckIcon className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => save.mutate({ id: i.id, status: "dropped" })} aria-label={t("dev.drop")}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 border-t bg-muted/30 px-4 py-3">
          <Input className="h-10 bg-background" placeholder={t("dev.newItem")} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={area} onChange={(e) => setArea(e.target.value)} aria-label={t("dev.areaLabel")}>
              {AREA_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`dev.area.${k}` as MessageKey)}
                </option>
              ))}
            </select>
            <Segmented aria-label={t("dev.priorityLabel")} value={priority} onChange={setPriority} options={[{ value: "1", label: "P1" }, { value: "2", label: "P2" }, { value: "3", label: "P3" }]} />
            <Button size="sm" className="ml-auto" onClick={add} disabled={save.isPending || title.trim().length < 2}>
              {save.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              {t("dev.add")}
            </Button>
          </div>
        </div>
      </Card>
      {done.length > 0 && (
        <details className="px-1">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("dev.doneRecently", { n: done.length })}</summary>
          <ul className="mt-1.5 space-y-1 text-sm">
            {done.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-muted-foreground">
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                <span className="line-through decoration-muted-foreground/40">{i.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
