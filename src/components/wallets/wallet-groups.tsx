"use client"

import { ChevronDownIcon, CreditCardIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import type { Currency, Wallet } from "@/lib/data/types"
import { isCard } from "@/lib/credit-card"
import { pick, type Locale } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { walletInstitution } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletAvatar } from "./wallet-avatar"
import { WalletList } from "./wallet-list"

/** "all", a provider key ("aba", "cash"…), or every credit card. */
export type WalletFilter = string
export const CARDS = "__cards"

export type WalletGroup = { key: string; name: string; icon: string | null; wallets: Wallet[] }

/** Wallets under their bank, banks in the order the user's own list first mentions them. Cards stay with their bank. */
export function groupByBank(wallets: Wallet[], locale: Locale): WalletGroup[] {
  const groups = new Map<string, WalletGroup>()
  for (const w of wallets) {
    const p = walletInstitution(w)
    const g = groups.get(p.key) ?? { key: p.key, name: pick(p.name, locale), icon: p.key, wallets: [] }
    g.wallets.push(w)
    groups.set(p.key, g)
  }
  return [...groups.values()]
}

export function filterWallets(wallets: Wallet[], filter: WalletFilter): Wallet[] {
  if (filter === "all") return wallets
  if (filter === CARDS) return wallets.filter(isCard)
  return wallets.filter((w) => walletInstitution(w).key === filter)
}

/** Per-currency subtotals (a bank's $ and ៛ accounts are never mixed by a rate). Cards count as what is owed. */
function subtotals(wallets: Wallet[]) {
  const sum = (c: Currency) => wallets.filter((w) => w.currency === c)
  return (["USD", "KHR"] as const)
    .filter((c) => sum(c).length > 0)
    .map((c) => ({ currency: c, value: roundMoney(sum(c).reduce((a, w) => a + w.balance, 0), c) }))
}

/** One tap filters: All · each bank you use · Credit cards. Hidden when there is nothing to tell apart. */
export function WalletFilterChips({
  groups,
  hasCards,
  value,
  onChange,
}: {
  groups: WalletGroup[]
  hasCards: boolean
  value: WalletFilter
  onChange: (value: WalletFilter) => void
}) {
  const t = useT()
  if (groups.length < 2 && !hasCards) return null
  const options = [
    { key: "all", label: t("common.all") },
    ...groups.map((g) => ({ key: g.key, label: g.name })),
    ...(hasCards ? [{ key: CARDS, label: t("wallets.cards") }] : []),
  ]
  return (
    <div role="radiogroup" aria-label={t("wallets.filterLabel")} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={(e) => {
            e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
            onChange(o.key)
          }}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-all active:scale-95",
            value === o.key ? "bg-primary font-semibold text-primary-foreground shadow-sm shadow-emerald-900/10" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Bank sections: a header with the bank, account count and subtotal (tap to fold), then its wallets. */
export function WalletGroups({
  groups,
  onSelect,
  collapsible = true,
}: {
  groups: WalletGroup[]
  onSelect: (wallet: Wallet) => void
  collapsible?: boolean
}) {
  const t = useT()
  const collapsed = usePrefsStore((s) => s.collapsedBanks)
  const toggle = usePrefsStore((s) => s.toggleBankCollapsed)

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const open = !collapsible || !collapsed.includes(g.key)
        const header = (
          <>
            {g.key === CARDS ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                <CreditCardIcon className="size-4" />
              </span>
            ) : (
              <WalletAvatar icon={g.icon} name={g.name} className="size-8 rounded-lg" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{g.name}</span>
              <span className="block text-xs text-muted-foreground">{g.wallets.length === 1 ? t("wallets.countOne") : t("wallets.count", { count: g.wallets.length })}</span>
            </span>
            <span className="text-right">
              {subtotals(g.wallets).map((s) => (
                <Amount key={s.currency} value={s.value} currency={s.currency} className="block text-sm font-semibold" />
              ))}
            </span>
            {collapsible && (
              <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} aria-hidden />
            )}
          </>
        )
        return (
          <section key={g.key} className="space-y-2">
            {collapsible ? (
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-muted/50"
              >
                {header}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-1 py-1">{header}</div>
            )}
            <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <div className="min-h-0 overflow-hidden" inert={!open}>
                <WalletList wallets={g.wallets} onSelect={onSelect} hideProvider={g.key !== CARDS} />
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** The groups to show for a filter: by bank under "All", else the one bank (or the cards) with its subtotal. */
export function useWalletGroups(wallets: Wallet[], filter: WalletFilter, cardsLabel: string): WalletGroup[] {
  const locale = useLocaleStore((s) => s.locale)
  if (filter === CARDS) return [{ key: CARDS, name: cardsLabel, icon: null, wallets: wallets.filter(isCard) }]
  return groupByBank(filterWallets(wallets, filter), locale)
}
