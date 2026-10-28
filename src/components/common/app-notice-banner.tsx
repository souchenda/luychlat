"use client"

import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { InfoIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { headerDate } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { type NoticeKind, type NoticeRow, visibleNotice } from "@/lib/incident-notices"
import { useLocaleStore } from "@/stores/locale-store"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type Row = NonNullable<NoticeRow> & { source: string; updated_at: string }

/** The one notice (public.app_notice), read every minute and when the app comes back on screen. */
export function useAppNotice() {
  return useQuery({
    queryKey: ["app-notice"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("app_notice").select("kind, starts_at, ends_at, source, updated_at").eq("id", 1).maybeSingle()
      if (error) throw error
      return (data as Row | null) ?? null
    },
  })
}

/** «Title» and «body» of a notice in the reader's language — the maintenance one with its date and hours. */
export function useNoticeText() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  return (kind: NoticeKind, row?: { starts_at: string | null; ends_at: string | null } | null) => {
    const start = row?.starts_at ? new Date(row.starts_at) : null
    const end = row?.ends_at ? new Date(row.ends_at) : null
    const vars = start && end ? { date: headerDate(start, locale), from: format(start, "HH:mm"), to: format(end, "HH:mm") } : { date: "", from: "", to: "" }
    return { title: t(`notice.${kind}.title` as MessageKey, vars), body: t(`notice.${kind}.body` as MessageKey) }
  }
}

const DISMISSED_KEY = "luychlat:notice-dismissed"

/**
 * The incident kit's banner (founder, 28/10/2026): when something is wrong, everyone reads the same prepared, calm
 * message in the app — nobody has to ask in the group. Closable; the same notice set again later shows again.
 */
export function AppNoticeBanner() {
  const notice = useAppNotice()
  const text = useNoticeText()
  const t = useT()
  const [now, setNow] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    setNow(Date.now())
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY))
    } catch {
      // no storage: shown until closed in this page
    }
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const row = notice.data
  const kind = now === null ? null : visibleNotice(row, now)
  if (!row || !kind) return null
  const stamp = `${kind}@${row.updated_at}`
  if (dismissed === stamp) return null
  const { title, body } = text(kind, row)
  return (
    <div role="status" aria-live="polite" className="mx-auto mb-3 flex w-full max-w-2xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-100">
      <InfoIcon className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{body}</p>
      </div>
      <button
        type="button"
        aria-label={t("common.close")}
        className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full opacity-60 hover:opacity-100"
        onClick={() => {
          setDismissed(stamp)
          try {
            localStorage.setItem(DISMISSED_KEY, stamp)
          } catch {
            // ignored
          }
        }}
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </div>
  )
}
