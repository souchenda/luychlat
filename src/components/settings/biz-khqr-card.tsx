"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon, Loader2Icon, QrCodeIcon, UnlinkIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useActiveWorkspace, useWorkspaces } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

/**
 * Settings › Telegram, for anyone who owns a business workspace (whatever
 * workspace is open; no plan check here — the database checks the plan when
 * a code is made, super admins exempt): link the Telegram group where ACLEDA /
 * ABA PayWay post KHQR payments. Each payment there is then recorded as Sales
 * income in that business, in real time, once.
 */
export function BizKhqrCard() {
  const t = useT()
  const active = useActiveWorkspace().workspace
  const businesses = (useWorkspaces().data ?? []).filter((w) => w.type === "BUSINESS" && w.role === "OWNER" && !w.archived_at)
  const [pickedId, setPickedId] = useState<string | null>(null)
  // The open business by default, else the first one owned.
  const workspace = businesses.find((w) => w.id === pickedId) ?? businesses.find((w) => w.id === active?.id) ?? businesses[0]
  const queryClient = useQueryClient()
  const [code, setCode] = useState<string | null>(null)
  const show = Boolean(workspace)

  const groups = useQuery({
    queryKey: ["biz-groups", workspace?.id],
    enabled: show,
    queryFn: async () => {
      const { data, error } = await client().rpc("biz_telegram_groups", { p_workspace_id: workspace!.id })
      if (error) throw error
      return (data ?? []) as { chat_id: number; title: string | null; linked_at: string }[]
    },
  })
  const getCode = useMutation({
    mutationFn: async () => {
      const { data, error } = await client().rpc("biz_telegram_code", { p_workspace_id: workspace!.id })
      if (error) throw error
      return data as string
    },
    onSuccess: setCode,
    onError: (e) => toast.error(/plan_required/.test((e as Error).message) ? t("pool.bot.planRequired") : t("common.error")),
  })
  const unlink = useMutation({
    mutationFn: async (chatId: number) => {
      const { error } = await client().rpc("biz_telegram_unlink", { p_workspace_id: workspace!.id, p_chat_id: chatId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t("biz.unlinked"))
      void queryClient.invalidateQueries({ queryKey: ["biz-groups"] })
    },
    onError: () => toast.error(t("common.error")),
  })

  if (!show || !workspace) return null
  const command = code ? `/biz link ${code}` : ""
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      toast.success(t("pool.copied"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <QrCodeIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{t("biz.cardTitle")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("biz.cardHint", { workspace: workspace.name })}</p>
        </div>
      </div>

      {businesses.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {businesses.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setPickedId(w.id)
                setCode(null)
              }}
              aria-pressed={w.id === workspace.id}
              className={
                w.id === workspace.id
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80"
              }
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {code ? (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-line text-muted-foreground">{t("biz.steps")}</p>
          <div className="flex gap-2">
            <p className="flex-1 rounded-xl bg-muted px-3 py-2 font-mono text-base">{command}</p>
            <Button size="icon" variant="outline" className="size-10 shrink-0" onClick={() => void copy()} aria-label={t("pool.copy")}>
              <CopyIcon />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("biz.codeValid")}</p>
        </div>
      ) : (
        <Button variant="outline" className="h-10" onClick={() => getCode.mutate()} disabled={getCode.isPending}>
          {getCode.isPending && <Loader2Icon className="animate-spin" />}
          {t("biz.getCode")}
        </Button>
      )}

      {(groups.data?.length ?? 0) > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("biz.linkedGroups")}</p>
          {groups.data!.map((g) => (
            <div key={g.chat_id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{g.title || `#${g.chat_id}`}</span>
              <Button size="sm" variant="ghost" onClick={() => unlink.mutate(g.chat_id)} disabled={unlink.isPending}>
                <UnlinkIcon />
                {t("biz.unlink")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
