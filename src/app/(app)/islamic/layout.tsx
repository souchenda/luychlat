"use client"

import { ArrowLeftIcon, BookHeartIcon, CoinsIcon, CompassIcon, Loader2Icon, MapPinIcon, MoonStarIcon, SettingsIcon, SunriseIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatHijri, toHijri } from "@/lib/islamic"
import { useIslamicDefaults, useIslamicSettings } from "@/lib/islamic-settings"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

// Prayer, then Tasbih (dhikr right after the prayer), Duas, Qibla, places, Zakat.
const TABS: { href: string; label: MessageKey; icon: LucideIcon }[] = [
  { href: "/islamic/prayer", label: "islamic.tab.prayer", icon: SunriseIcon },
  { href: "/islamic/tasbih", label: "islamic.tab.tasbih", icon: MoonStarIcon },
  { href: "/islamic/duas", label: "islamic.tab.duas", icon: BookHeartIcon },
  { href: "/islamic/qibla", label: "islamic.tab.qibla", icon: CompassIcon },
  { href: "/islamic/places", label: "islamic.tab.places", icon: MapPinIcon },
  { href: "/islamic", label: "islamic.tab.finance", icon: CoinsIcon },
]

/** Islamic suite: header with today's Hijri date, tabs, and the "turned off" notice for every page. */
export default function IslamicLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  const locale = useLocaleStore((s) => s.locale)
  const { settings, loading } = useIslamicSettings()
  const offset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
  const hijri = toHijri(new Date(), offset)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/home">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{t("islamic.title")}</h1>
          {hijri && (
            <p className="text-xs text-muted-foreground">
              <time suppressHydrationWarning>{formatHijri(hijri, locale)}</time>
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
      ) : !settings.enabled ? (
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("islamic.off")}</p>
          <Button asChild variant="outline">
            <Link href="/settings">
              <SettingsIcon />
              {t("nav.settings")}
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          <nav aria-label={t("islamic.title")} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = href === "/islamic" ? pathname === "/islamic" : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(label)}
                </Link>
              )
            })}
          </nav>
          {children}
        </>
      )}
    </div>
  )
}
