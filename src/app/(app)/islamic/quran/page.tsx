"use client"

import { BookOpenTextIcon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/use-t"
import { QURAN_TRANSLATION, SURAHS, surahByNumber } from "@/lib/quran"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"
import { useLocaleStore } from "@/stores/locale-store"

const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** The 114 surahs, with "continue reading" where the user stopped. */
export default function QuranIndexPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const last = useIslamicLocalStore((s) => s.quranLast)
  const [query, setQuery] = useState("")

  const list = useMemo(() => {
    const q = query.trim()
    if (!q) return SURAHS
    const n = Number(q)
    return SURAHS.filter((s) => (Number.isInteger(n) && s.n === n) || simplify(s.latin).includes(simplify(q)) || s.ar.includes(q))
  }, [query])
  const lastSurah = last ? surahByNumber(last.sura) : null

  return (
    <div className="space-y-3">
      {lastSurah && last && (
        <Link href={`/islamic/quran/${last.sura}?aya=${last.aya}`} className="block">
          <Card className="flex-row items-center gap-3 border-primary/30 bg-primary/5 px-4 py-3">
            <BookOpenTextIcon className="size-6 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("quran.continue")}</p>
              <p className="truncate font-semibold">
                {lastSurah.n}. {lastSurah.latin} · {t("quran.verse", { n: last.aya })}
              </p>
            </div>
            <span dir="rtl" lang="ar" className="font-quran text-xl">
              {lastSurah.ar}
            </span>
          </Card>
        </Link>
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("quran.search")} className="h-10 pl-9" aria-label={t("quran.search")} inputMode="search" />
      </div>

      <Card className="gap-0 divide-y py-0">
        {list.map((s) => (
          <Link key={s.n} href={`/islamic/quran/${s.n}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">{s.n}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.latin}</span>
              <span className="block text-xs text-muted-foreground">{t("quran.verses", { count: s.ayat })}</span>
            </span>
            <span dir="rtl" lang="ar" className="font-quran text-xl leading-none">
              {s.ar}
            </span>
          </Link>
        ))}
        {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("quran.noMatch")}</p>}
      </Card>

      <p className="px-1 text-[11px] text-muted-foreground">
        {t("quran.credit", { publisher: QURAN_TRANSLATION.publisher[locale] })}{" "}
        <a href={QURAN_TRANSLATION.url} target="_blank" rel="noopener noreferrer" className="underline">
          {QURAN_TRANSLATION.source}
        </a>
      </p>
    </div>
  )
}
