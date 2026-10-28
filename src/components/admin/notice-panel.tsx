"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { MegaphoneIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { rpc, Section } from "@/components/admin/ui"
import { useAppNotice, useNoticeText } from "@/components/common/app-notice-banner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { NOTICE_KINDS, type NoticeKind, visibleNotice } from "@/lib/incident-notices"

/** Tonight 23:00–23:30, as the datetime-local fields want it. */
const tonight = (h: number, m: number) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

/**
 * Control Center › the notice to users (founder, 28/10/2026 — the incident kit): what everyone sees now, and one tap per
 * prepared notice (never free text), «resolved» to remove it. Each tap: super admin, 2FA on this session, audited
 * (public.ops_set_notice). The watchdog sets and clears its own automatic notices.
 */
export function NoticePanel() {
  const t = useT()
  const text = useNoticeText()
  const queryClient = useQueryClient()
  const notice = useAppNotice()
  const [from, setFrom] = useState(() => tonight(23, 0))
  const [to, setTo] = useState(() => tonight(23, 30))
  const set = useMutation({
    mutationFn: (kind: NoticeKind | null) =>
      rpc<null>("ops_set_notice", {
        p_kind: kind,
        p_starts_at: kind === "maintenance" ? new Date(from).toISOString() : null,
        p_ends_at: kind === "maintenance" ? new Date(to).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success(t("ops.notice.done"))
      void queryClient.invalidateQueries({ queryKey: ["app-notice"] })
    },
    onError: (e: Error) => toast.error(/mfa_required/.test(e.message) ? t("ops.mfa") : t("common.error")),
  })
  const row = notice.data
  const showing = visibleNotice(row, Date.now())
  const scheduled = !showing && row?.kind === "maintenance"

  const tap = (kind: NoticeKind | null) => {
    const preview = kind ? text(kind, kind === "maintenance" ? { starts_at: new Date(from).toISOString(), ends_at: new Date(to).toISOString() } : null) : null
    const ask = preview ? `${t("ops.notice.preview")}\n\n${preview.title}\n${preview.body}` : t("ops.notice.resolved")
    if (window.confirm(ask)) set.mutate(kind)
  }

  return (
    <Section title={t("ops.notice.title")} icon={<MegaphoneIcon />}>
      <Card className="gap-3 px-4 py-4">
        {showing || scheduled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-500/10">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {t("ops.notice.showing")}
              {row?.source === "auto" ? ` · ${t("ops.notice.auto")}` : ""}
            </p>
            <p className="text-sm font-semibold">{text((showing ?? row!.kind) as NoticeKind, row).title}</p>
            <p className="text-xs text-muted-foreground">{text((showing ?? row!.kind) as NoticeKind, row).body}</p>
          </div>
        ) : (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("ops.notice.none")}</p>
        )}
        {(showing || scheduled) && (
          <Button type="button" className="h-11 rounded-xl" disabled={set.isPending} onClick={() => tap(null)}>
            {t("ops.notice.resolved")}
          </Button>
        )}
        <div className="grid gap-2">
          {NOTICE_KINDS.filter((k) => k !== "maintenance").map((k) => (
            <Button key={k} type="button" variant="outline" className="h-auto min-h-11 justify-start rounded-xl py-2 text-left whitespace-normal" disabled={set.isPending || showing === k} onClick={() => tap(k)}>
              {t("ops.notice.show")} · {text(k).title}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 rounded-xl border px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("ops.notice.maintenanceFrom")}
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-lg border bg-background px-2 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("ops.notice.maintenanceTo")}
              <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-lg border bg-background px-2 text-sm text-foreground" />
            </label>
          </div>
          <Button type="button" variant="outline" className="h-auto min-h-11 justify-start rounded-xl py-2 text-left whitespace-normal" disabled={set.isPending || !from || !to || to <= from} onClick={() => tap("maintenance")}>
            {t("ops.notice.show")} · {text("maintenance", { starts_at: from ? new Date(from).toISOString() : null, ends_at: to ? new Date(to).toISOString() : null }).title}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("ops.notice.hint")}</p>
      </Card>
    </Section>
  )
}
