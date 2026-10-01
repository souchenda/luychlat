"use client"

import { ArrowLeftIcon, BotIcon, ChevronDownIcon, ChevronRightIcon, CrownIcon, LifeBuoyIcon, ReceiptTextIcon, ScaleIcon, SearchIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { GUIDE, type GuideSection } from "@/lib/guide/content"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"

const ICONS: Record<GuideSection["id"], React.ComponentType<{ className?: string }>> = {
  start: WalletIcon,
  tracking: ReceiptTextIcon,
  reconcile: ScaleIcon,
  ai: BotIcon,
  plans: CrownIcon,
}

/** របៀបប្រើប្រាស់: collapsible FAQ; /guide#<section> opens and scrolls to that section. */
export default function GuidePage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [query, setQuery] = useState("")
  const [openSection, setOpenSection] = useState<string | null>(null)

  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!GUIDE.some((s) => s.id === id)) return
    setOpenSection(id)
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (text: string) => !q || text.toLowerCase().includes(q)
  const sections = GUIDE.map((s) => ({
    ...s,
    items: s.items.filter((i) => matches(i.q[locale]) || i.a.some((p) => matches(p[locale])) || matches(s.title[locale])),
  })).filter((s) => s.items.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/settings">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("guide.title")}</h1>
      </div>

      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("guide.search")} className="h-11 pl-9" aria-label={t("guide.search")} />
      </div>

      {sections.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("guide.noResults")}</p>}

      {sections.map((section) => {
        const Icon = ICONS[section.id]
        return (
          <section key={section.id} id={section.id} className="scroll-mt-20 space-y-2">
            <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
              <Icon className="size-4 text-primary" aria-hidden />
              {section.title[locale]}
            </h2>
            <Card className="gap-0 divide-y py-0">
              {section.items.map((item, i) => (
                <details
                  key={item.q.en}
                  className="group"
                  open={Boolean(q) || (openSection === section.id && i === 0) || undefined}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{item.q[locale]}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.a.map((p) => (
                      <p key={p.en}>{p[locale]}</p>
                    ))}
                  </div>
                </details>
              ))}
            </Card>
          </section>
        )
      })}

      <Link href="/support" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-4 transition-colors hover:bg-muted/60">
        <LifeBuoyIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-sm">{t("guide.stillStuck")}</span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>
    </div>
  )
}
