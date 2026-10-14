"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useState } from "react"

import { useT } from "@/lib/i18n/use-t"
import { deviceReady, type SoundboxDevice } from "@/lib/soundbox"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const ictTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)

/**
 * «🟢 SoundBox ready · iPhone · 20 s ago» / «🔴 SoundBox not connected · last 13:59» — the business's
 * counter phones from their heartbeat (founder, 14/10/2026). Hidden for a business that has never
 * opened the SoundBox (no device in 7 days).
 */
export function SoundboxStatus({ workspaceId, link = false, className }: { workspaceId: string | null | undefined; link?: boolean; className?: string }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const every = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(every)
  }, [])
  const devices = useQuery({
    queryKey: ["soundbox-devices", workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return []
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from("soundbox_devices")
        .select("id, platform, visible, audio_unlocked, live, last_seen, last_ready_at")
        .eq("workspace_id", workspaceId!)
        .gte("last_seen", since)
        .order("last_seen", { ascending: false })
      if (error) throw error
      return (data ?? []) as SoundboxDevice[]
    },
  })
  const list = devices.data ?? []
  if (!list.length) return null
  const ready = list.find((d) => deviceReady(d, now))
  const lastReady = list.map((d) => d.last_ready_at).filter((x): x is string => Boolean(x)).sort().at(-1)
  const secs = ready ? Math.max(0, Math.round((now - Date.parse(ready.last_seen)) / 1000)) : 0
  const text = ready
    ? t("soundbox.statusReady", { device: ready.platform ?? "SoundBox", ago: secs < 60 ? t("soundbox.agoSec", { n: secs }) : t("soundbox.agoMin", { n: Math.round(secs / 60) }) })
    : lastReady
      ? t("soundbox.statusDown", { time: ictTime(lastReady) })
      : t("soundbox.statusNever")
  const body = (
    <p
      role="status"
      className={cn(
        "rounded-xl border px-3 py-2 text-sm font-medium",
        ready ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200",
        className,
      )}
    >
      {text}
    </p>
  )
  return link ? <Link href="/soundbox">{body}</Link> : body
}
