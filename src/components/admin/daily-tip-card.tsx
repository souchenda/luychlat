"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, ImageIcon, ImageUpIcon, Loader2Icon, RefreshCwIcon, Undo2Icon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { TIP_BODY_MAX, TIP_TITLE_MAX, defaultTip, nextTip } from "@/lib/daily-tip"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { supabaseUrl } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

export type DailyTip = {
  day: string
  tip_id: string | null
  title: string
  body: string
  poster_path: string | null
  status: "DRAFT" | "APPROVED" | "SKIPPED" | "POSTED"
  version: number
  approved_at: string | null
  posted_at: string | null
}

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}
const ppNow = () => new Date(Date.now() + 7 * 3_600_000)
const ppToday = () => ppNow().toISOString().slice(0, 10)
const dmy = (ymd: string) => ymd.split("-").reverse().join("/")
/** Today's 12:00 (Cambodia) cut-off has passed for this day. */
const lockedFor = (day: string) => day < ppToday() || (day === ppToday() && ppNow().getUTCHours() >= 12)
const posterUrl = (path: string) => `${supabaseUrl}/storage/v1/object/public/tip-posters/${path}`

const STATUS_STYLE: Record<DailyTip["status"], string> = {
  DRAFT: "text-amber-600 dark:text-amber-400",
  APPROVED: "text-emerald-700 dark:text-emerald-400",
  SKIPPED: "text-muted-foreground",
  POSTED: "text-sky-700 dark:text-sky-400",
}

/** One day's tip in Admin › Super › Daily tips: edit, poster, approve / skip. */
export function DayCard({ day, tip }: { day: string; tip: DailyTip | null }) {
  const t = useT()
  const qc = useQueryClient()
  const suggestion = defaultTip(day)
  const [title, setTitle] = useState(tip?.title ?? suggestion.title.km)
  const [body, setBody] = useState(tip?.body ?? suggestion.body.km)
  const [tipId, setTipId] = useState<string | null>(tip?.tip_id ?? suggestion.id)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // A newer version from the server (the bot, another tab) replaces the form.
  useEffect(() => {
    if (!tip) return
    setTitle(tip.title)
    setBody(tip.body)
    setTipId(tip.tip_id)
  }, [tip?.version]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only on a new version
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const locked = lockedFor(day)
  const posted = tip?.status === "POSTED"
  const dirty = !tip || title.trim() !== tip.title || body.trim() !== tip.body
  const valid = title.trim().length > 0 && body.trim().length > 0 && title.length <= TIP_TITLE_MAX && body.length <= TIP_BODY_MAX

  const change = useMutation({
    mutationFn: async (args: { action: "save" | "approve" | "skip" | "draft"; poster?: string | null; keepPoster?: boolean }) => {
      const { data, error } = await client().rpc("super_tip_change", {
        p_day: day,
        p_action: args.action,
        p_version: args.action === "approve" ? (tip?.version ?? null) : null,
        p_title: args.action === "save" ? title.trim() : null,
        p_body: args.action === "save" ? body.trim() : null,
        p_tip_id: args.action === "save" ? tipId : null,
        p_poster_path: args.poster ?? null,
        p_keep_poster: args.keepPoster ?? true,
      })
      if (error) throw error
      return data as DailyTip
    },
    onSuccess: (_, args) => {
      qc.invalidateQueries({ queryKey: ["daily-tips"] })
      toast.success(t(args.action === "approve" ? "tips.approved" : args.action === "skip" ? "tips.skipped" : "tips.saved"))
    },
    onError: (e: Error) =>
      toast.error(/too_late/.test(e.message) ? t("tips.tooLate") : /stale_version/.test(e.message) ? t("tips.stale") : /already_posted/.test(e.message) ? t("tips.alreadyPosted") : t("common.error")),
  })

  const showPoster = async () => {
    try {
      const token = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session?.access_token
      const res = await fetch("/api/admin/tip-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ day, title, body }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setPreview(URL.createObjectURL(await res.blob()))
    } catch {
      toast.error(t("common.error"))
    }
  }

  const upload = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) return toast.error(t("tips.posterInvalid"))
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
    const path = `${day}/${crypto.randomUUID().replace(/-/g, "")}.${ext}`
    const { error } = await client().storage.from("tip-posters").upload(path, file, { contentType: file.type, upsert: false })
    if (error) return toast.error(t("common.error"))
    change.mutate({ action: "save", poster: path, keepPoster: false })
  }

  const busy = change.isPending
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {dmy(day)}
          {day === ppToday() && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("tips.isToday")}</span>}
        </h2>
        <span className={cn("text-xs font-semibold", tip ? STATUS_STYLE[tip.status] : "text-muted-foreground")}>
          {tip ? `${t(`tips.status.${tip.status}`)} · v${tip.version}` : t("tips.notPrepared")}
        </span>
      </div>

      <div className="space-y-1">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TIP_TITLE_MAX} disabled={posted || busy} aria-label={t("tips.titleLabel")} className="font-semibold" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TIP_BODY_MAX} rows={4} disabled={posted || busy} aria-label={t("tips.bodyLabel")} />
        <p className="text-right text-[11px] text-muted-foreground tabular-nums">
          {body.length}/{TIP_BODY_MAX}
        </p>
      </div>

      {(preview || tip?.poster_path) && (
        <div className="relative overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG / uploaded poster */}
          <img src={preview ?? posterUrl(tip!.poster_path!)} alt={t("tips.poster")} className="w-full" />
          {tip?.poster_path && !preview && <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">{t("tips.customPoster")}</span>}
        </div>
      )}

      {!posted && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={showPoster} disabled={!valid || busy}>
            <ImageIcon />
            {t("tips.previewPoster")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImageUpIcon />
            {t("tips.uploadPoster")}
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {tip?.poster_path && (
            <Button size="sm" variant="ghost" onClick={() => change.mutate({ action: "save", poster: null, keepPoster: false })} disabled={busy}>
              <XIcon />
              {t("tips.removePoster")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const next = nextTip(tipId)
              setTitle(next.title.km)
              setBody(next.body.km)
              setTipId(next.id)
              setPreview(null)
            }}
            disabled={busy}
          >
            <RefreshCwIcon />
            {t("tips.newTip")}
          </Button>
        </div>
      )}

      {!posted && (
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          {dirty ? (
            <Button className="col-span-2" onClick={() => change.mutate({ action: "save" })} disabled={!valid || busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              {t("tips.save")}
            </Button>
          ) : tip?.status === "SKIPPED" ? (
            <Button className="col-span-2" variant="outline" onClick={() => change.mutate({ action: "draft" })} disabled={busy}>
              <Undo2Icon />
              {t("tips.reopen")}
            </Button>
          ) : (
            <>
              <Button onClick={() => change.mutate({ action: "approve" })} disabled={busy || locked || tip?.status === "APPROVED"}>
                <CheckIcon />
                {tip?.status === "APPROVED" ? t("tips.status.APPROVED") : t("tips.approve")}
              </Button>
              <Button variant="outline" onClick={() => change.mutate({ action: "skip" })} disabled={busy}>
                <XIcon />
                {t("tips.skip")}
              </Button>
            </>
          )}
          {locked && tip?.status !== "APPROVED" && <p className="col-span-2 text-xs text-muted-foreground">{t("tips.tooLate")}</p>}
        </div>
      )}
    </Card>
  )
}
