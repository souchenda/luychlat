"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon, KeyRoundIcon, Loader2Icon, QrCodeIcon, UnlinkIcon } from "lucide-react"
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

const copyText = async (text: string, ok: string, fail: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(ok)
  } catch {
    toast.error(fail)
  }
}

type Biz = { id: string; name: string }

/**
 * Settings › Telegram, for anyone who owns a business workspace (whatever
 * workspace is open; no plan check here — the database checks the plan, super
 * admins exempt): KHQR payments recorded as Sales income in that business —
 * from a linked Telegram group, or pushed by the merchant's own tool (AUTOBOK)
 * with an API key.
 */
export function BizKhqrCard() {
  const active = useActiveWorkspace().workspace
  const businesses = (useWorkspaces().data ?? []).filter((w) => w.type === "BUSINESS" && w.role === "OWNER" && !w.archived_at)
  const [pickedId, setPickedId] = useState<string | null>(null)
  // The open business by default, else the first one owned.
  const workspace = businesses.find((w) => w.id === pickedId) ?? businesses.find((w) => w.id === active?.id) ?? businesses[0]
  if (!workspace) return null
  return (
    <>
      <GroupLink key={`g-${workspace.id}`} workspace={workspace} businesses={businesses} onPick={setPickedId} />
      <ApiKey key={`k-${workspace.id}`} workspace={workspace} />
    </>
  )
}

/** The Telegram group link: a code for /biz link CODE, and the linked groups. */
function GroupLink({ workspace, businesses, onPick }: { workspace: Biz; businesses: Biz[]; onPick: (id: string) => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [code, setCode] = useState<string | null>(null)

  const groups = useQuery({
    queryKey: ["biz-groups", workspace.id],
    queryFn: async () => {
      const { data, error } = await client().rpc("biz_telegram_groups", { p_workspace_id: workspace.id })
      if (error) throw error
      return (data ?? []) as { chat_id: number; title: string | null; linked_at: string }[]
    },
  })
  const getCode = useMutation({
    mutationFn: async () => {
      const { data, error } = await client().rpc("biz_telegram_code", { p_workspace_id: workspace.id })
      if (error) throw error
      return data as string
    },
    onSuccess: setCode,
    onError: (e) => toast.error(/plan_required/.test((e as Error).message) ? t("pool.bot.planRequired") : t("common.error")),
  })
  const unlink = useMutation({
    mutationFn: async (chatId: number) => {
      const { error } = await client().rpc("biz_telegram_unlink", { p_workspace_id: workspace.id, p_chat_id: chatId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t("biz.unlinked"))
      void queryClient.invalidateQueries({ queryKey: ["biz-groups"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  const command = code ? `/biz link ${code}` : ""

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
              onClick={() => onPick(w.id)}
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
            <Button size="icon" variant="outline" className="size-10 shrink-0" onClick={() => void copyText(command, t("pool.copied"), t("common.error"))} aria-label={t("pool.copy")}>
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

/** AUTOBOK / API: a secret key (shown once) for POST /api/khqr/ingest. */
function ApiKey({ workspace }: { workspace: Biz }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [plain, setPlain] = useState<string | null>(null)
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/khqr/ingest` : "/api/khqr/ingest"

  const info = useQuery({
    queryKey: ["khqr-api-key", workspace.id],
    queryFn: async () => {
      const { data, error } = await client().rpc("khqr_api_key_info", { p_workspace_id: workspace.id })
      if (error) throw error
      return data as { hint: string; created_at: string; last_used_at: string | null } | null
    },
  })
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await client().rpc("khqr_api_key_create", { p_workspace_id: workspace.id })
      if (error) throw error
      return data as string
    },
    onSuccess: (key) => {
      setPlain(key)
      void queryClient.invalidateQueries({ queryKey: ["khqr-api-key"] })
    },
    onError: (e) => toast.error(/plan_required/.test((e as Error).message) ? t("pool.bot.planRequired") : t("common.error")),
  })
  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await client().rpc("khqr_api_key_revoke", { p_workspace_id: workspace.id })
      if (error) throw error
    },
    onSuccess: () => {
      setPlain(null)
      toast.success(t("biz.apiRevoked"))
      void queryClient.invalidateQueries({ queryKey: ["khqr-api-key"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "short", timeStyle: "short" })

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
          <KeyRoundIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{t("biz.apiTitle")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("biz.apiHint", { workspace: workspace.name })}</p>
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <p className="text-muted-foreground">POST · Authorization: Bearer …</p>
        <div className="flex gap-2">
          <p className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-1.5 font-mono">{endpoint}</p>
          <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={() => void copyText(endpoint, t("pool.copied"), t("common.error"))} aria-label={t("pool.copy")}>
            <CopyIcon />
          </Button>
        </div>
      </div>

      {plain ? (
        <div className="space-y-1.5 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-500/10">
          <p className="font-medium text-amber-900 dark:text-amber-200">{t("biz.apiShownOnce")}</p>
          <div className="flex gap-2">
            <p className="min-w-0 flex-1 rounded-lg bg-white px-2.5 py-1.5 font-mono break-all dark:bg-black/30">{plain}</p>
            <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={() => void copyText(plain, t("pool.copied"), t("common.error"))} aria-label={t("pool.copy")}>
              <CopyIcon />
            </Button>
          </div>
        </div>
      ) : info.data ? (
        <p className="text-xs text-muted-foreground">
          {t("biz.apiActive", { hint: info.data.hint })} · {info.data.last_used_at ? t("biz.apiLastUsed", { when: when(info.data.last_used_at) }) : t("biz.apiNeverUsed")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="outline" className="h-10 flex-1" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending && <Loader2Icon className="animate-spin" />}
          {t(info.data ? "biz.apiRegenerate" : "biz.apiCreate")}
        </Button>
        {info.data && (
          <Button variant="ghost" className="h-10" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            {t("biz.apiRevoke")}
          </Button>
        )}
      </div>
    </Card>
  )
}
