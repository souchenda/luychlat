"use client"

import { ArrowLeftIcon, BookHeartIcon, BookOpenTextIcon, CoinsIcon, CompassIcon, Loader2Icon, MapPinIcon, MoonStarIcon, Music2Icon, SunriseIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { IslamicModeOff } from "@/components/islamic/islamic-mode"
import { type MessageKey, contentLocale } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatHijri, ISLAMIC_ARABIC, toHijri } from "@/lib/islamic"
import { useIslamicDefaults, useIslamicSettings } from "@/lib/islamic-settings"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

// The founder's order (18/10/2026): prayer, tasbih, du'a, Quran, zakat, qibla — each with its Arabic name — then places.
const TABS: { href: string; label: MessageKey; icon: LucideIcon; ar?: string }[] = [
  { href: "/islamic/prayer", label: "islamic.tab.prayer", icon: SunriseIcon, ar: ISLAMIC_ARABIC.prayer },
  { href: "/islamic/tasbih", label: "islamic.tab.tasbih", icon: MoonStarIcon, ar: ISLAMIC_ARABIC.tasbih },
  { href: "/islamic/duas", label: "islamic.tab.duas", icon: BookHeartIcon, ar: ISLAMIC_ARABIC.duas },
  { href: "/islamic/quran", label: "islamic.tab.quran", icon: BookOpenTextIcon, ar: ISLAMIC_ARABIC.quran },
  { href: "/islamic/nasheed", label: "islamic.tab.nasheed", icon: Music2Icon, ar: ISLAMIC_ARABIC.nasheed },
  { href: "/islamic", label: "islamic.tab.finance", icon: CoinsIcon, ar: ISLAMIC_ARABIC.finance },
  { href: "/islamic/qibla", label: "islamic.tab.qibla", icon: CompassIcon, ar: ISLAMIC_ARABIC.qibla },
  { href: "/islamic/places", label: "islamic.tab.places", icon: MapPinIcon },
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
              <time suppressHydrationWarning>{formatHijri(hijri, contentLocale(locale))}</time>
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
      ) : !settings.enabled ? (
        <IslamicModeOff />
      ) : (
        <>
          {/* Scrolls sideways without the grey scrollbar (founder, 18/10/2026). */}
          <nav aria-label={t("islamic.title")} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(({ href, label, icon: Icon, ar }) => {
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
                  {ar && (
                    <span dir="rtl" lang="ar" className="font-arabic text-[15px] leading-none opacity-90">
                      ({ar})
                    </span>
                  )}
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
