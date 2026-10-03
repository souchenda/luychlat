"use client"

import { useQuery } from "@tanstack/react-query"
import { AArrowDownIcon, AArrowUpIcon, ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, LanguagesIcon, RefreshCwIcon } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n/use-t"
import { parseSurah, QURAN_TRANSLATION, showsBasmala, surahByNumber, type QuranSurahText } from "@/lib/quran"
import { cn } from "@/lib/utils"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"
import { useLocaleStore } from "@/stores/locale-store"
import { pick } from "@/lib/i18n/dictionaries"

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])
const BASMALA = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ"
const FONT_MIN = 20
const FONT_MAX = 44

/** One surah: Uthmani Arabic verse by verse with the Khmer translation; remembers where you stopped. */
export default function SurahPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const sura = parseSurah(useParams<{ sura: string }>().sura)
  const startAya = Number(useSearchParams().get("aya")) || null
  const { quranFontSize: size, quranShowKm: showKm, setQuran } = useIslamicLocalStore()

  const query = useQuery({
    queryKey: ["quran", sura],
    enabled: sura !== null,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/quran/${sura}`)
      if (!res.ok) throw new Error(String(res.status))
      return (await res.json()) as QuranSurahText
    },
  })

  // A reload would otherwise put the old scroll position back over the jump below.
  useEffect(() => {
    if (!("scrollRestoration" in history)) return
    const previous = history.scrollRestoration
    history.scrollRestoration = "manual"
    return () => {
      history.scrollRestoration = previous
    }
  }, [])

  // Jump to the verse the user was reading, and keep it in place while the
  // page settles (the Quran font changes line heights as it arrives) — until
  // the user scrolls themselves.
  useEffect(() => {
    if (!query.data || !startAya) return
    let userMoved = false
    const stop = () => {
      userMoved = true
    }
    const jump = () => {
      if (!userMoved) document.getElementById(`aya-${startAya}`)?.scrollIntoView({ block: "start" })
    }
    jump()
    const list = document.getElementById("quran-verses")
    const resize = new ResizeObserver(jump)
    if (list) resize.observe(list)
    const events = ["touchstart", "wheel", "keydown", "mousedown"] as const
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }))
    const done = window.setTimeout(() => resize.disconnect(), 4000)
    return () => {
      resize.disconnect()
      window.clearTimeout(done)
      events.forEach((e) => window.removeEventListener(e, stop))
    }
  }, [query.data, startAya])

  // Remember the verse at the top of the screen.
  useEffect(() => {
    if (!query.data || !sura) return
    const seen = new Set<number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.aya)
          if (e.isIntersecting) seen.add(n)
          else seen.delete(n)
        }
        if (seen.size) setQuran({ quranLast: { sura, aya: Math.min(...seen) } })
      },
      { rootMargin: "-20% 0px -60% 0px" },
    )
    document.querySelectorAll("[data-aya]").forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [query.data, sura, setQuran])

  if (!sura) {
    return (
      <Card className="items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("quran.notFound")}</p>
        <Button asChild variant="outline">
          <Link href="/islamic/quran">{t("common.back")}</Link>
        </Button>
      </Card>
    )
  }
  const surah = surahByNumber(sura)

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-1 border-b bg-background/95 px-2 py-1.5 backdrop-blur">
        <Button asChild size="icon" variant="ghost" aria-label={t("quran.allSurahs")}>
          <Link href="/islamic/quran">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {surah.n}. {surah.latin}
          </p>
          <p className="text-[11px] text-muted-foreground">{t("quran.verses", { count: surah.ayat })}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setQuran({ quranFontSize: Math.max(FONT_MIN, size - 4) })} disabled={size <= FONT_MIN} aria-label={t("quran.smaller")}>
          <AArrowDownIcon />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setQuran({ quranFontSize: Math.min(FONT_MAX, size + 4) })} disabled={size >= FONT_MAX} aria-label={t("quran.bigger")}>
          <AArrowUpIcon />
        </Button>
        <Button size="icon" variant={showKm ? "secondary" : "ghost"} onClick={() => setQuran({ quranShowKm: !showKm })} aria-pressed={showKm} aria-label={t("quran.translation")}>
          <LanguagesIcon />
        </Button>
      </div>

      <div className="py-2 text-center">
        <p dir="rtl" lang="ar" className="font-quran text-3xl">
          سُورَةُ {surah.ar}
        </p>
        {showsBasmala(sura) && (
          <p dir="rtl" lang="ar" className="font-quran mt-2 text-2xl text-primary">
            {BASMALA}
          </p>
        )}
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError || !query.data ? (
        <Card className="items-center gap-3 px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("quran.loadError")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCwIcon />
            {t("prayer.gpsRetry")}
          </Button>
        </Card>
      ) : (
        <ol id="quran-verses" className="space-y-2">
          {query.data.verses.map((v) => (
            <li key={v.aya} id={`aya-${v.aya}`} data-aya={v.aya} className={cn("scroll-mt-16 rounded-xl px-1 py-3", v.aya === startAya && "bg-primary/5")}>
              <p dir="rtl" lang="ar" className="font-quran leading-[2.3]" style={{ fontSize: `${size}px` }}>
                {v.ar} <span className="text-primary">{`۝${toArabicDigits(v.aya)}`}</span>
              </p>
              {showKm && (
                <p className="mt-1.5 text-[15px] leading-relaxed">
                  <span className="mr-1.5 text-xs font-semibold text-primary tabular-nums">{v.aya}.</span>
                  {v.km}
                </p>
              )}
              {showKm && v.fn && <p className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">{v.fn}</p>}
            </li>
          ))}
        </ol>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        {sura > 1 ? (
          <Button asChild variant="outline">
            <Link href={`/islamic/quran/${sura - 1}`}>
              <ChevronLeftIcon />
              <span className="truncate">{surahByNumber(sura - 1).latin}</span>
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {sura < 114 && (
          <Button asChild variant="outline">
            <Link href={`/islamic/quran/${sura + 1}`}>
              <span className="truncate">{surahByNumber(sura + 1).latin}</span>
              <ChevronRightIcon />
            </Link>
          </Button>
        )}
      </div>

      <p className="px-1 pb-4 text-[11px] text-muted-foreground">
        {t("quran.credit", { publisher: pick(QURAN_TRANSLATION.publisher, locale) })}{" "}
        <a href={QURAN_TRANSLATION.url} target="_blank" rel="noopener noreferrer" className="underline">
          {QURAN_TRANSLATION.source}
        </a>
        {query.data?.version && ` · ${t("quran.version", { v: query.data.version })}`}
      </p>
    </div>
  )
}
