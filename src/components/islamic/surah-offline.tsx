"use client"

import { CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { create } from "zustand"

import { cachedAudioUrls, downloadAudio } from "@/lib/audio-cache"
import { useKhmerT } from "@/lib/i18n/use-t"
import { quranAudioUrl } from "@/lib/quran-audio"
import { cn } from "@/lib/utils"

/** The recitations kept on this phone, read once and refreshed after a download or a clear (lib/audio-cache.ts). */
export const useOfflineAudio = create<{ urls: Set<string>; loaded: boolean; refresh: () => Promise<void> }>((set) => ({
  urls: new Set(),
  loaded: false,
  refresh: async () => set({ urls: await cachedAudioUrls().catch(() => new Set<string>()), loaded: true }),
}))

/** «💾 ស្ដាប់ Offline បាន» when this surah, by this reciter, is kept on the phone. */
export function OfflineBadge({ surah, reciter }: { surah: number; reciter: string }) {
  const t = useKhmerT()
  const kept = useOfflineAudio((s) => s.urls.has(quranAudioUrl(surah, reciter)))
  if (!kept) return null
  return <span className="ml-1.5 inline-flex rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">{t("audioCache.offline")}</span>
}

/** ⬇️ keep this surah for offline listening (founder, 19/10/2026); ✓ once kept. */
export function SurahDownloadButton({ surah, reciter }: { surah: number; reciter: string }) {
  const t = useKhmerT()
  const url = quranAudioUrl(surah, reciter)
  const { urls, loaded, refresh } = useOfflineAudio()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])
  const kept = urls.has(url)
  const download = useCallback(async () => {
    setBusy(true)
    try {
      await downloadAudio(url)
      await refresh()
      toast.success(t("audioCache.done"))
    } catch {
      toast.error(t("audioCache.failed"))
    } finally {
      setBusy(false)
    }
  }, [url, refresh, t])
  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={busy || kept}
      aria-label={kept ? t("audioCache.offline") : t("audioCache.download")}
      className={cn("grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted", kept && "text-emerald-600")}
    >
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : kept ? <CheckIcon className="size-4" /> : <DownloadIcon className="size-4" />}
    </button>
  )
}
