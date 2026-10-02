"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DUAS } from "@/lib/duas"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"

/** Daily duas: Arabic, a Khmer reading aid, the meaning, and the source. */
export default function DuasPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [copied, setCopied] = useState<string | null>(null)

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
            <h2 className="flex-1 text-sm font-semibold">{d.title[locale]}</h2>
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
          <p className="text-sm leading-relaxed">{d[locale]}</p>
          <p className="text-[11px] text-muted-foreground">📖 {d.source}</p>
        </Card>
      ))}
      <p className="px-1 text-[11px] text-muted-foreground">{t("duas.disclaimer")}</p>
    </div>
  )
}
