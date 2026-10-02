"use client"

import {
  BookOpenIcon,
  ChartColumnIcon,
  CrownIcon,
  FileSpreadsheetIcon,
  GiftIcon,
  HandCoinsIcon,
  HeadsetIcon,
  MenuIcon,
  MoonStarIcon,
  SettingsIcon,
  ShieldIcon,
  TargetIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher"
import { APP_VERSION } from "@/lib/app-info"
import { useProfile } from "@/lib/data/hooks"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { showUpgrade, usePlan } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

type Item = { href: string; label: MessageKey; icon: LucideIcon; hint?: MessageKey; pro?: boolean }

/** Up to two initials: "Sou Chenda" → "SC", "ចិន្តា" → "ចិ" (whole Khmer letter clusters). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = (w: string) => {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(w)[Symbol.iterator]().next().value
    return seg?.segment ?? ""
  }
  if (!words.length) return "?"
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toUpperCase()
}

function NavLink({ item, active, onNavigate, badge }: { item: Item; active: boolean; onNavigate?: () => void; badge?: React.ReactNode }) {
  const t = useT()
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/90 hover:bg-muted",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{t(item.label)}</span>
        {item.hint && <span className="block truncate text-[11px] font-normal text-muted-foreground">{t(item.hint)}</span>}
      </span>
      {badge}
    </Link>
  )
}

/** Profile header, workspace pills and the grouped menu. Shared by the drawer (phones) and the sidebar (tablet / desktop). */
function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT()
  const pathname = usePathname()
  const user = useSessionStore((s) => s.user)
  const name = useProfile().data?.display_name?.trim() || user?.email?.split("@")[0] || t("app.name")
  const contact = user?.email || user?.phone || ""
  const { plan } = usePlan()
  const pro = plan.tier === "PRO"
  const islamic = useIslamicEnabled()

  const groups: { title: MessageKey; items: Item[] }[] = [
    {
      title: "nav.group.accounts",
      items: [
        { href: "/wallets", label: "nav.wallets", icon: WalletIcon },
        { href: "/debts", label: "nav.debts", icon: HandCoinsIcon },
      ],
    },
    {
      title: "nav.group.tools",
      items: [
        { href: "/reports", label: "reports.title", icon: ChartColumnIcon },
        { href: "/budgets", label: "budget.title", icon: TargetIcon },
        { href: "/reports#export", label: "reports.export", icon: FileSpreadsheetIcon, pro: true },
      ],
    },
    {
      title: "nav.group.perks",
      items: [
        { href: "/settings#referral", label: "referral.title", icon: GiftIcon, hint: "nav.referHint" },
        ...(islamic ? [{ href: "/islamic", label: "islamic.title", icon: MoonStarIcon } as Item] : []),
      ],
    },
    {
      title: "nav.group.help",
      items: [
        { href: "/guide", label: "guide.title", icon: BookOpenIcon },
        { href: "/support", label: "support.title", icon: HeadsetIcon },
        { href: "/settings", label: "nav.settings", icon: SettingsIcon },
        // Cosmetic only: the admin page and its RPCs check is_admin() in the database.
        ...(plan.is_admin ? [{ href: "/admin", label: "admin.title", icon: ShieldIcon } as Item] : []),
      ],
    },
  ]
  // "/reports#export" is not "the Reports page" for highlighting; hash links never show as active.
  const isActive = (href: string) => !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`))

  return (
    <div className="flex h-full flex-col">
      {/* Profile */}
      <div className="space-y-3 border-b px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-base font-bold text-white shadow-sm"
            aria-hidden
          >
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            {contact && <p className="truncate text-xs text-muted-foreground">{contact}</p>}
          </div>
        </div>
        {pro ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <CrownIcon className="size-3.5" aria-hidden />
            LuyChlat PRO
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{t("plan.free")}</span>
            <Button
              size="sm"
              className="h-7 rounded-full bg-amber-500 px-3 text-xs text-white hover:bg-amber-600"
              onClick={() => {
                onNavigate?.()
                showUpgrade()
              }}
            >
              <CrownIcon className="size-3.5" />
              {t("upgrade.cta")}
            </Button>
          </div>
        )}
        <WorkspaceSwitcher />
      </div>

      {/* Menu */}
      <nav aria-label={t("nav.menu")} className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t(group.title)}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onNavigate={onNavigate}
                badge={
                  item.pro && !pro ? (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">PRO</span>
                  ) : undefined
                }
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t px-5 py-3 text-[11px] text-muted-foreground">
        <BrandMark className="size-5 rounded-md text-[11px] shadow-none" />
        លុយឆ្លាត · LuyChlat v{APP_VERSION}
      </div>
    </div>
  )
}

/** ☰ button for the header on phones; opens the menu as a slide-out drawer from the left. */
export function MobileNavTrigger() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // Close when the route changes (e.g. back gesture while open).
  useEffect(() => setOpen(false), [pathname])
  return (
    <>
      <Button variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label={t("nav.menu")} onClick={() => setOpen(true)}>
        <MenuIcon className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[85%] max-w-xs gap-0 p-0 pt-[env(safe-area-inset-top)]">
          <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
          <SheetDescription className="sr-only">{t("app.name")}</SheetDescription>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Tablet and desktop: the same menu as a fixed left sidebar (the app frame shifts right to make room). */
export function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r bg-background/95 backdrop-blur md:block print:hidden">
      <NavContent />
    </aside>
  )
}
