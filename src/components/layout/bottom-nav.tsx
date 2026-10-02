"use client"

import { ArrowLeftRightIcon, ChartColumnIcon, LayoutDashboardIcon, MinusIcon, PlusIcon, SparklesIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { EntryFormSheet } from "@/components/transactions/entry-form-sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { canWrite, useActiveWorkspace, useWallets } from "@/lib/data/hooks"
import type { CategoryType } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

type Item = { href: string; label: MessageKey; icon: typeof WalletIcon }

// The everyday screens, with "record" in the middle. Wallets and Debts are on Home and in the ☰ menu.
const LEFT: Item[] = [
  { href: "/home", label: "nav.home", icon: LayoutDashboardIcon },
  { href: "/transactions", label: "nav.transactions", icon: ArrowLeftRightIcon },
]
const RIGHT: Item[] = [
  { href: "/reports", label: "reports.title", icon: ChartColumnIcon },
  { href: "/advisor", label: "nav.advisor", icon: SparklesIcon },
]

function NavItem({ item, pathname }: { item: Item; pathname: string }) {
  const t = useT()
  const active = pathname.startsWith(item.href)
  const Icon = item.icon
  return (
    <li className="flex-1">
      <Link
        href={item.href}
        className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-primary" : "text-muted-foreground")}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
        {t(item.label)}
      </Link>
    </li>
  )
}

/** Raised "+" in the middle: record income, an expense or a transfer from any screen. */
function QuickAdd() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const wallets = useWallets(ws).data ?? []
  const active = wallets.filter((w) => !w.archived_at)
  const [entryType, setEntryType] = useState<CategoryType | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  // Viewers in a family workspace can look but not record.
  const disabled = !ws || !canWrite(workspace)

  return (
    <li className="flex flex-1 justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="-mt-4 flex flex-col items-center gap-1 text-[11px] font-medium text-primary disabled:opacity-40"
            aria-label={t("nav.add")}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-emerald-900/25 ring-4 ring-background">
              <PlusIcon className="size-6" strokeWidth={2.5} />
            </span>
            {t("nav.add")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-48">
          <DropdownMenuItem className="py-2.5" onSelect={() => setEntryType("INCOME")}>
            <PlusIcon className="text-emerald-600" />
            {t("tx.INCOME")}
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2.5" onSelect={() => setEntryType("EXPENSE")}>
            <MinusIcon className="text-rose-600" />
            {t("tx.EXPENSE")}
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2.5" disabled={active.length < 2} onSelect={() => setTransferOpen(true)}>
            <ArrowLeftRightIcon />
            {t("tx.TRANSFER")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {ws && (
        <>
          <EntryFormSheet
            open={entryType !== null}
            onOpenChange={(open) => !open && setEntryType(null)}
            workspaceId={ws}
            wallets={wallets}
            type={entryType ?? "EXPENSE"}
          />
          <TransferSheet open={transferOpen} onOpenChange={setTransferOpen} workspaceId={ws} wallets={wallets} />
        </>
      )}
    </li>
  )
}

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t print:hidden bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-x-auto md:bottom-6 md:left-[calc(50%+8.5rem)] md:w-full md:max-w-md md:-translate-x-1/2 md:rounded-b-[2rem] md:border-x md:border-b">
      <ul className="mx-auto flex max-w-md items-end">
        {LEFT.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} />
        ))}
        <QuickAdd />
        {RIGHT.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  )
}
