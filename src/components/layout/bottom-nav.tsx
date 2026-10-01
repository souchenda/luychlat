"use client"

import { BotIcon, ClipboardListIcon, HouseIcon, ReceiptTextIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

const ITEMS: { href: string; label: MessageKey; icon: typeof HouseIcon }[] = [
  { href: "/home", label: "nav.home", icon: HouseIcon },
  { href: "/transactions", label: "nav.transactions", icon: ReceiptTextIcon },
  { href: "/debts", label: "nav.debts", icon: ClipboardListIcon },
  { href: "/advisor", label: "nav.advisor", icon: BotIcon },
  { href: "/wallets", label: "nav.wallets", icon: WalletIcon },
]

export function BottomNav() {
  const t = useT()
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
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
                <Icon className="size-5" />
                {t(label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
