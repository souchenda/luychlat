"use client"

import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  CoinsIcon,
  ChartColumnIcon,
  CrownIcon,
  FileSpreadsheetIcon,
  GiftIcon,
  HandCoinsIcon,
  HeadsetIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LightbulbIcon,
  MenuIcon,
  MoonStarIcon,
  ChevronRightIcon,
  PencilIcon,
  SettingsIcon,
  ShieldIcon,
  TargetIcon,
  ReceiptIcon,
  ScrollTextIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { BusinessTrialTag } from "@/components/billing/business-trial"
import { BrandMark } from "@/components/brand-mark"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { BusinessProfileSheet } from "@/components/profile/profile-sheets"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher"
import { APP_VERSION } from "@/lib/app-info"
import { useActiveWorkspace, useProfile } from "@/lib/data/hooks"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { showUpgrade, usePlan } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

type Item = { href: string; label: MessageKey; icon: LucideIcon; hint?: MessageKey; pro?: boolean }

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
function NavContent({ onNavigate, inDrawer }: { onNavigate?: () => void; inDrawer?: boolean }) {
  const t = useT()
  const pathname = usePathname()
  const user = useSessionStore((s) => s.user)
  const profile = useProfile().data
  const { workspace } = useActiveWorkspace()
  // In the Business workspace the header shows the business, not the person.
  const business = workspace?.type === "BUSINESS" ? workspace : undefined
  const personName = profile?.display_name?.trim() || user?.email?.split("@")[0] || t("app.name")
  const name = business ? business.name : personName
  const subtitle = business
    ? [business.business_industry ? t(`industry.${business.business_industry}` as MessageKey) : null, business.business_phone].filter(Boolean).join(" · ") ||
      t("business.addDetails")
    : profile?.phone || user?.email || user?.phone || ""
  const [editOpen, setEditOpen] = useState(false)
  const router = useRouter()
  const { plan } = usePlan()
  const pro = plan.tier !== "FREE"
  const islamic = useIslamicEnabled()

  // Staff only. Cosmetic: the admin pages and their RPCs check the staff role in the database.
  const admin: Item[] = plan.is_admin || plan.staff_role ? [{ href: "/admin", label: "admin.title", icon: ShieldIcon }] : []
  const exportItem: Item = { href: "/reports#export", label: "reports.export", icon: FileSpreadsheetIcon, pro: true }
  const help = {
    title: "nav.group.help" as MessageKey,
    items: [
      { href: "/guide", label: "nav.userGuide", icon: BookOpenIcon },
      { href: "/market", label: "market.title", icon: LandmarkIcon },
      { href: "/learn", label: "tips.hubTitle", icon: LightbulbIcon },
      { href: "/support", label: "support.title", icon: HeadsetIcon },
      { href: "/settings", label: "nav.settings", icon: SettingsIcon },
    ] as Item[],
  }
  // A business sees the business tools only (no tontine, gifts, saving goals or Islamic tools);
  // Personal and Family see the household menu.
  const groups: { title: MessageKey; items: Item[] }[] =
    workspace?.type === "BUSINESS"
      ? [
          {
            title: "nav.group.bizOps",
            items: [
              { href: "/home", label: "nav.home", icon: LayoutDashboardIcon },
              { href: "/invoices", label: "nav.invoicesKhqr", icon: ScrollTextIcon },
              { href: "/wallets", label: "nav.bizWallets", icon: WalletIcon },
              { href: "/transactions", label: "nav.bizTransactions", icon: ArrowLeftRightIcon },
            ],
          },
          { title: "nav.group.bizDebts", items: [{ href: "/debts", label: "nav.bizDebts", icon: HandCoinsIcon }] },
          {
            title: "nav.group.bizReports",
            items: [{ href: "/reports", label: "nav.bizReports", icon: ChartColumnIcon }, ...admin, exportItem],
          },
          help,
        ]
      : [
          {
            title: "nav.group.daily",
            items: [
              { href: "/home", label: "nav.home", icon: LayoutDashboardIcon },
              ...admin,
              { href: "/wallets", label: "nav.walletsBanks", icon: WalletIcon },
              { href: "/transactions", label: "nav.transactions", icon: ArrowLeftRightIcon },
              { href: "/reports", label: "reports.title", icon: ChartColumnIcon },
            ],
          },
          {
            title: "nav.group.planning",
            items: [
              { href: "/bills", label: "nav.billsLife", icon: ReceiptIcon },
              { href: "/debts", label: "nav.debtTracking", icon: HandCoinsIcon },
              { href: "/budgets", label: "nav.budgetSaving", icon: TargetIcon },
              { href: "/assets", label: "assets.pageTitle", icon: CoinsIcon },
            ],
          },
          {
            title: "nav.group.social",
            items: [
              { href: "/gifts", label: "gift.pageTitle", icon: GiftIcon },
              { href: "/pools", label: "pool.pageTitle", icon: UsersRoundIcon },
            ],
          },
          {
            title: "nav.group.other",
            items: [
              { href: "/settings/plan#referral", label: "referral.title", icon: GiftIcon, hint: "nav.referHint" },
              ...(islamic ? [{ href: "/islamic/prayer", label: "islamic.title", icon: MoonStarIcon } as Item] : []),
              exportItem,
            ],
          },
          help,
        ]
  // "/reports#export" is not "the Reports page" for highlighting; hash links never show as active.
  const isActive = (href: string) => {
    if (href.includes("#")) return false
    // Every Islamic tab counts as the Islamic item; budgets and goals are one item.
    if (href.startsWith("/islamic")) return pathname.startsWith("/islamic")
    if (href === "/budgets") return pathname.startsWith("/budgets") || pathname.startsWith("/goals")
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Profile */}
      {/* In the drawer, leave room on the right for its ✕ button. */}
      <div className={cn("space-y-3 border-b px-4 pt-5 pb-4", inDrawer && "pr-12")}>
        <button
          type="button"
          onClick={() => {
            // A business is edited in place; a person opens the profile page.
            if (business) return setEditOpen(true)
            onNavigate?.()
            router.push("/profile")
          }}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-muted"
          aria-label={t(business ? "business.title" : "profile.title")}
        >
          <ProfileAvatar path={business ? business.logo_path : profile?.avatar_path} name={name} business={Boolean(business)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{name}</span>
            {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          {business ? (
            <PencilIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
        <BusinessTrialTag workspace={business} />
        {pro ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <CrownIcon className="size-3.5" aria-hidden />
            LuyChlat {plan.tier}
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

      {business && <BusinessProfileSheet open={editOpen} onOpenChange={setEditOpen} workspace={business} />}

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
          <NavContent inDrawer onNavigate={() => setOpen(false)} />
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
