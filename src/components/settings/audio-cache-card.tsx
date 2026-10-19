"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useOfflineAudio } from "@/components/islamic/surah-offline"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { audioCacheBytes, clearAudioCache, formatBytes } from "@/lib/audio-cache"
import { useKhmerT } from "@/lib/i18n/use-t"

/** Settings › data: the recitations kept for offline listening, and «សម្អាតទំហំចម្រៀង/គួរអាន» (founder, 19/10/2026). */
export function AudioCacheCard() {
  const t = useKhmerT()
  const refresh = useOfflineAudio((s) => s.refresh)
  const [bytes, setBytes] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void audioCacheBytes().then(setBytes).catch(() => setBytes(0))
  }, [])
  const clear = async () => {
    setBusy(true)
    try {
      await clearAudioCache()
      await refresh()
      setBytes(0)
      toast.success(t("audioCache.cleared"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="gap-2 px-4 py-4">
      <h2 className="font-semibold">{t("audioCache.title")}</h2>
      <p className="text-sm text-muted-foreground">{bytes === null ? "…" : bytes > 0 ? t("audioCache.size", { size: formatBytes(bytes) }) : t("audioCache.empty")}</p>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={() => void clear()} disabled={busy || !bytes}>
        {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        {t("audioCache.clear")}
      </Button>
    </Card>
  )
}
