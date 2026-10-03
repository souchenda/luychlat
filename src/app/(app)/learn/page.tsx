"use client"

import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { HUB_TOPICS, TIPS, TOPIC_META, type TipTopic } from "@/lib/tips"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

/** Financial knowledge hub: rounded topic cards, each opening short, practical tips. */
export default function LearnPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const islamic = useIslamicEnabled()
  const [open, setOpen] = useState<TipTopic | null>("saving")
  const topics = HUB_TOPICS.filter((topic) => topic !== "islamic" || islamic)

  return (
    <div className="space-y-5 pb-10">
      <SettingsSubHeader title={t("tips.hubTitle")} back="/home" />
      <p className="text-sm text-muted-foreground">{t("tips.hubIntro")}</p>

      <div className="space-y-3">
        {topics.map((topic) => {
          const meta = TOPIC_META[topic]
          const tips = TIPS.filter((tip) => tip.topic === topic)
          const expanded = open === topic
          return (
            <section key={topic} className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : topic)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden>
                  {meta.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{meta.title[locale]}</span>
                  <span className="block text-xs text-muted-foreground">{t("tips.count", { n: tips.length })}</span>
                </span>
                <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
              </button>
              {expanded && (
                <ul className="divide-y border-t">
                  {tips.map((tip) => (
                    <li key={tip.id} className="px-4 py-3">
                      <p className="text-sm font-semibold">{tip.title[locale]}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{tip.body[locale]}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">{t("tips.disclaimer")}</p>
    </div>
  )
}
