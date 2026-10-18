"use client"

import { useQuery } from "@tanstack/react-query"
import { ExternalLinkIcon } from "lucide-react"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { contentLocale } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { FASTING_HADITHS, FASTING_VERSES, SUNNAH_FAST_HADITH } from "@/lib/islamic"
import { QURAN_TRANSLATION, type QuranSurahText } from "@/lib/quran"
import { useLocaleStore } from "@/stores/locale-store"

/** One verse: the Uthmani Arabic and the official Khmer translation, as QuranEnc publishes them (unmodified). */
function Verse({ ar, km, aya }: { ar: string; km: string; aya: number }) {
  return (
    <figure className="space-y-3 rounded-2xl border bg-emerald-50/60 px-4 py-4 dark:bg-emerald-500/5">
      <p dir="rtl" lang="ar" className="font-quran text-2xl leading-[2.2] text-foreground">
        {ar}
      </p>
      <p className="text-[15px] leading-relaxed text-foreground/90">{km}</p>
      <figcaption className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Al-Baqarah 2:{aya}</figcaption>
    </figure>
  )
}

/**
 * «ការតមបួស និងផលបុណ្យ» — why we fast (2:183, taqwa), the meaning of Imsak and Iftar (2:187), and the great
 * rewards of fasting (Bukhari 1894, 38, 1896). The verses come from the Quran reader's verified source.
 */
export function FastingWisdomSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const lang = contentLocale(locale)
  const surah = useQuery({
    queryKey: ["quran-sura", 2],
    enabled: open,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch("/api/quran/2")
      if (!res.ok) throw new Error(`quran ${res.status}`)
      return (await res.json()) as QuranSurahText
    },
  })
  const verse = (aya: number) => surah.data?.verses.find((v) => v.aya === aya)

  const section = (title: string, aya: number, note: string) => {
    const v = verse(aya)
    return (
      <section className="space-y-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {v ? <Verse ar={v.ar} km={v.km} aya={aya} /> : <p className="text-sm text-muted-foreground">{surah.isError ? t("fasting.verseFailed") : t("fasting.verseLoading")}</p>}
        <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
      </section>
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("fasting.wisdomTitle")}>
      <div className="space-y-6">
        {section(
          t("fasting.whyTitle"),
          FASTING_VERSES[0].aya,
          lang === "km" ? "គោលបំណងនៃការតមបួស៖ ដើម្បីបណ្តុះចិត្តកោតខ្លាចអល់ឡោះ (តាកវ៉ា — Taqwa)។" : "The purpose of fasting: to grow taqwa — mindfulness of Allah.",
        )}
        {section(
          t("fasting.imsakIftarTitle"),
          FASTING_VERSES[1].aya,
          lang === "km"
            ? "ការតមចាប់ផ្តើមនៅពេលអរុណោទ័យ (ស៊ុពហ៍) — អ៊ឹមសាក់ ១០ នាទីមុននោះ ជាការប្រុងប្រយ័ត្ន — ហើយបញ្ចប់នៅពេលយប់ចូល (ម៉ាហ្គ្រិប) ជាពេលស្រាយបួស។"
            : "The fast begins at dawn (Fajr) — Imsak, 10 minutes earlier, is a precaution — and ends at nightfall (Maghrib), the time of Iftar.",
        )}
        {/* Wajib or Sunnah, and what each means (founder, 18/10/2026). */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold">{t("fasting.rulingTitle")}</h3>
          <div className="space-y-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3 dark:border-rose-900/50 dark:bg-rose-500/5">
              <p className="font-medium">{t("fasting.badgeWajib")}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/90">{t("fasting.wajibBody")}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-500/5">
              <p className="font-medium">{t("fasting.badgeSunnah")}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/90">{t("fasting.sunnahBody")}</p>
              <a href={SUNNAH_FAST_HADITH.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300">
                {SUNNAH_FAST_HADITH.source}
                <ExternalLinkIcon className="size-3" aria-hidden />
              </a>
            </div>
            <div className="rounded-2xl border px-4 py-3">
              <p className="font-medium">{t("fasting.imsak")}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/90">{t("fasting.imsakBody")}</p>
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-base font-semibold">{t("fasting.rewardsTitle")}</h3>
          <ol className="space-y-3">
            {FASTING_HADITHS.map((h, i) => (
              <li key={h.source} className="rounded-2xl border px-4 py-3">
                <p className="font-medium">
                  {i + 1}. {h.title[lang]}
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-foreground/90">{h[lang]}</p>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300">
                  {h.source}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">{t("fasting.hadithNote")}</p>
        </section>
        <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          {t("fasting.quranCredit", { publisher: QURAN_TRANSLATION.publisher[lang], source: `${QURAN_TRANSLATION.source}${surah.data?.version ? ` (v${surah.data.version})` : ""}` })}
        </p>
      </div>
    </BottomSheet>
  )
}
