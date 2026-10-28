"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DatabaseBackupIcon, GlobeIcon, Loader2Icon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { NoticePanel } from "@/components/admin/notice-panel"
import { ago, rpc, Section } from "@/components/admin/ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { type Level, type OpsAction, type OpsReport, overall, verdicts } from "@/lib/ops-status"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Command = { id: string; action: OpsAction; status: "pending" | "running" | "done" | "failed"; requested_at: string; done_at: string | null; result: string | null }

const DOT: Record<Level, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" }
const ICON: Record<OpsAction, React.ReactNode> = {
  website_republish: <GlobeIcon className="size-4" aria-hidden />,
  website_rollback: <RotateCcwIcon className="size-4" aria-hidden />,
  backup_now: <DatabaseBackupIcon className="size-4" aria-hidden />,
}

/**
 * The Control Center (founder, 28/10/2026): the Droplet's health and security at a glance, from the server agent
 * (deploy/ops-agent.py → public.ops_status, every 5 minutes), and three safe actions — each a fixed command the agent
 * runs on the server, asked through public.ops_request() (super admin, 2FA on this session, one at a time, audited).
 */
export function ControlCenter() {
  const t = useT()
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ["admin", "ops-status"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("ops_status").select("value, updated_at").eq("key", "summary").maybeSingle()
      if (error) throw error
      return (data?.value as OpsReport | undefined) ?? null
    },
  })
  const history = useQuery({
    queryKey: ["admin", "ops-commands"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!
        .from("ops_commands")
        .select("id, action, status, requested_at, done_at, result")
        .order("requested_at", { ascending: false })
        .limit(8)
      if (error) throw error
      return data as Command[]
    },
  })
  const request = useMutation({
    mutationFn: (action: OpsAction) => rpc<string>("ops_request", { p_action: action }),
    onSuccess: () => {
      toast.success(t("ops.sent"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "ops-commands"] })
    },
    onError: (e: Error) => toast.error(/mfa_required/.test(e.message) ? t("ops.mfa") : /busy/.test(e.message) ? t("ops.busy") : t("common.error")),
  })

  const report = status.data ?? null
  const now = Math.floor(Date.now() / 1000)
  const lines = verdicts(report, now)
  const head = overall(lines)
  const busy = (history.data ?? []).some((c) => c.status === "pending" || c.status === "running")

  const detail = (key: string): string => {
    if (!report) return t("ops.noReport")
    switch (key) {
      case "agent":
        return t("ops.updated", { ago: ago(new Date(report.at * 1000).toISOString()) })
      case "website":
        return report.website.tampered
          ? t("ops.d.tampered")
          : `HTTP ${report.website.code} · ${report.website.watched ? t("ops.d.watched") : t("ops.d.notWatched")}`
      case "app":
        return `HTTP ${report.app.code}${report.app.last_deploy ? ` · ${report.app.last_deploy}` : ""}`
      case "certs":
        return Object.entries(report.certs)
          .map(([d, n]) => `${d} ${t("ops.d.days", { n })}`)
          .join(" · ")
      case "domains":
        return Object.entries(report.domains)
          .map(([d, v]) => `${d} ${t("ops.d.days", { n: v.days })}`)
          .join(" · ")
      case "backup":
        return report.backup.last_ok ? t("ops.d.backup", { ago: ago(new Date(report.backup.last_ok * 1000).toISOString()) }) : t("ops.d.noBackup")
      case "security":
        return t("ops.d.security", { total: report.security.banned_total ?? "—", now: report.security.banned_now ?? "—" })
      case "disk":
        return t("ops.d.disk", { free: report.disk.free_gb, pct: report.disk.used_pct })
      default:
        return ""
    }
  }

  const ask = (action: OpsAction) => {
    if (window.confirm(t("ops.confirm", { action: t(`ops.action.${action}` as MessageKey) }))) request.mutate(action)
  }

  return (
    <div className="space-y-6">
      <Card className={cn("gap-1 px-4 py-4", head === "ok" ? "bg-emerald-500/10" : head === "warn" ? "bg-amber-500/10" : "bg-red-500/10")}>
        <p className="text-lg font-bold">{t(`ops.overall.${head}` as MessageKey)}</p>
        <p className="text-xs text-muted-foreground">{report ? t("ops.updated", { ago: ago(new Date(report.at * 1000).toISOString()) }) : t("ops.noReport")}</p>
      </Card>

      {/* The incident kit: what every user sees when something is wrong (founder, 28/10/2026). */}
      <NoticePanel />

      <Section title={t("ops.healthTitle")} icon={<ShieldCheckIcon />}>
        <Card className="gap-0 divide-y py-0">
          {status.isLoading ? (
            <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
          ) : (
            lines.map((v) => (
              <div key={v.key} className="flex items-start gap-3 px-4 py-3">
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[v.level])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(`ops.item.${v.key}` as MessageKey)}</p>
                  <p className="text-xs break-words text-muted-foreground">{detail(v.key)}</p>
                </div>
              </div>
            ))
          )}
        </Card>
      </Section>

      <Section title={t("ops.actionsTitle")} icon={<RotateCcwIcon />}>
        <Card className="gap-2 px-4 py-4">
          {(["website_republish", "website_rollback", "backup_now"] as OpsAction[]).map((a) => (
            <Button key={a} type="button" variant={a === "website_rollback" ? "outline" : "secondary"} className="h-11 justify-start gap-2 rounded-xl" disabled={busy || request.isPending} onClick={() => ask(a)}>
              {ICON[a]}
              {t(`ops.action.${a}` as MessageKey)}
            </Button>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">{t("ops.actionsHint")}</p>
        </Card>
        {(history.data ?? []).length > 0 && (
          <Card className="gap-0 divide-y py-0">
            {(history.data ?? []).map((c) => (
              <div key={c.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm">{t(`ops.action.${c.action}` as MessageKey)}</p>
                  <p className={cn("shrink-0 text-xs font-medium", c.status === "done" ? "text-emerald-600" : c.status === "failed" ? "text-red-600" : "text-amber-600")}>
                    {t(`ops.status.${c.status}` as MessageKey)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">{ago(c.requested_at)}</p>
                {c.status === "failed" && c.result && <p className="mt-1 text-[11px] break-words text-red-600">{c.result.slice(-200)}</p>}
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  )
}
