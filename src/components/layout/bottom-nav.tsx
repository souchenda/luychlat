"use client"

import { ArrowLeftRightIcon, HandCoinsIcon, LayoutDashboardIcon, SparklesIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

const ITEMS: { href: string; label: MessageKey; icon: typeof WalletIcon }[] = [
  { href: "/home", label: "nav.home", icon: LayoutDashboardIcon },
  { href: "/transactions", label: "nav.transactions", icon: ArrowLeftRightIcon },
  { href: "/debts", label: "nav.debts", icon: HandCoinsIcon },
  { href: "/advisor", label: "nav.advisor", icon: SparklesIcon },
  { href: "/wallets", label: "nav.wallets", icon: WalletIcon },
]

export function BottomNav() {
  const t = useT()
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t print:hidden bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {t(label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
