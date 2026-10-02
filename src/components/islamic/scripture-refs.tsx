"use client"

import { BookOpenIcon, ChevronDownIcon } from "lucide-react"

import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { SCRIPTURE, type ScriptureTopic } from "@/lib/scripture"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

const KIND_STYLE = {
  quran: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  hadith: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  note: "bg-muted text-muted-foreground",
}

/** "📖 Quranic & Hadith references": a collapsed section with the evidence behind a tool. */
export function ScriptureRefs({ topics, className }: { topics: ScriptureTopic[]; className?: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  return (
    <details className={cn("group rounded-xl border bg-card", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <BookOpenIcon className="size-4 text-primary" aria-hidden />
        <span className="flex-1">{t("scripture.title")}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t px-4 py-3">
        {topics.map((topic) => (
          <section key={topic} className="space-y-2">
            {topics.length > 1 && <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`scripture.topic.${topic}` as MessageKey)}</h3>}
            <ul className="space-y-2">
              {SCRIPTURE[topic].map((c) => (
                <li key={c.source} className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", KIND_STYLE[c.kind])}>
                    {c.kind === "note" ? t(`scripture.kind.note` as MessageKey) : c.source}
                  </span>
                  {c.arabic && (
                    <p dir="rtl" lang="ar" className="font-arabic text-lg leading-loose">
                      {c.arabic}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{c[locale]}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-[11px] text-muted-foreground">{t("scripture.disclaimer")}</p>
      </div>
    </details>
  )
}
