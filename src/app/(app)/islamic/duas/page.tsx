"use client"

import { CheckIcon, CopyIcon, UploadIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DuaAudioButton } from "@/components/islamic/dua-audio-button"
import { DuaUploadSheet } from "@/components/islamic/dua-upload-sheet"
import { duaAudioSrc, DUA_RECORDINGS } from "@/lib/dua-audio"
import { useDuaRecordings } from "@/lib/dua-audio-data"
import { DUAS, type Dua } from "@/lib/duas"
import { useKhmerT, useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"
import { useLocaleStore } from "@/stores/locale-store"
import { pick } from "@/lib/i18n/dictionaries"

/**
 * Daily duas: Arabic, a Khmer reading aid, the meaning, and the source. A du'a with a recording has 🔊 and
 * «🔁 ទន្ទេញ»; the super admin adds or replaces one with «📤 បញ្ចូលសំឡេង» (or /setdua in the bot).
 */
export default function DuasPage() {
  const t = useT()
  const tk = useKhmerT()
  const locale = useLocaleStore((s) => s.locale)
  const [copied, setCopied] = useState<string | null>(null)
  const owner = usePlan().plan.staff_role === "super_admin"
  const uploaded = useDuaRecordings().data ?? {}
  const [uploading, setUploading] = useState<Dua | null>(null)
  const urls = Object.fromEntries(Object.entries(uploaded).map(([id, r]) => [id, r.url]))

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
    } catch {
      // Clipboard can be blocked; nothing to do.
    }
  }

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-muted-foreground">{t("duas.intro")}</p>
      {DUAS.map((d) => (
        <Card key={d.id} className="gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">{pick(d.title, locale)}</h2>
            {/* 🔊 to listen and memorise — shown once the du'a has a cleared recording (lib/dua-audio.ts). */}
            <DuaAudioButton id={d.id} src={duaAudioSrc(d.id, DUA_RECORDINGS, urls)} />
            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => void copy(d.id, d.arabic)} aria-label={t("duas.copy")}>
              {copied === d.id ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
            </Button>
          </div>
          <p dir="rtl" lang="ar" className="font-arabic text-2xl leading-[2.1]">
            {d.arabic}
          </p>
          <div className="space-y-1 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-sm leading-relaxed text-primary">{locale === "km" ? d.phonetic : d.latin}</p>
            {locale === "km" && <p className="text-[11px] text-muted-foreground italic">{d.latin}</p>}
          </div>
          <p className="text-sm leading-relaxed">{pick(d, locale)}</p>
          <p className="text-[11px] text-muted-foreground">📖 {d.source}</p>
          {(uploaded[d.id] || owner) && (
            <div className="flex items-center gap-2">
              {uploaded[d.id] && <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">🎙 {uploaded[d.id].credit}</p>}
              {owner && (
                <Button size="sm" variant="ghost" className="ml-auto h-9 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setUploading(d)}>
                  <UploadIcon className="size-4" aria-hidden />
                  {tk("duas.upload.button")}
                </Button>
              )}
            </div>
          )}
        </Card>
      ))}
      {owner && uploading && (
        <DuaUploadSheet dua={uploading} current={uploaded[uploading.id] ?? null} open onOpenChange={(open) => !open && setUploading(null)} />
      )}
      <p className="px-1 text-[11px] text-muted-foreground">{t("duas.disclaimer")}</p>
    </div>
  )
}
