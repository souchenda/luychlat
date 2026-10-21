"use client"

import { ChevronDownIcon, ChevronUpIcon, EllipsisIcon, PencilIcon, ReceiptTextIcon, UserIcon, UsersIcon } from "lucide-react"
import { walletDisplayName } from "@/lib/wallet-name"

import { Amount } from "@/components/money/amount"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useActiveWorkspace, useMembers } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { isCard } from "@/lib/credit-card"
import { convert } from "@/lib/money"
import { maskAccount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { getProvider } from "@/lib/wallets/providers"
import { KIND_ACCENT, walletKind } from "@/lib/wallet-overview"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

import { CardMeter } from "./credit-card"
import { WalletAvatar } from "./wallet-avatar"
import { pick } from "@/lib/i18n/dictionaries"

type WalletListProps = {
  wallets: Wallet[]
  onSelect?: (wallet: Wallet) => void
  /** Shows up/down controls instead of opening wallets. */
  reorderMode?: boolean
  onMove?: (index: number, direction: -1 | 1) => void
  muted?: boolean
  /** Inside a bank group: the bank is in the header, so rows show only currency and account. */
  hideProvider?: boolean
  /** The primary wallet (lib/wallet-overview › primaryWalletId): its «ចម្បង» badge. */
  primaryId?: string | null
  /** The ••• menu's «កែកាបូប» (editors only; without it the menu offers only the statement). */
  onEdit?: (wallet: Wallet) => void
}

/**
 * The wallets as cards (founder, 21/10/2026 — after ACLEDA Mobile): a colour bar on the left for the kind (emerald cash,
 * blue bank, gold savings, violet card), the name and its bank · currency · masked account, «ចម្បង» on the primary one,
 * the balance (masked with the eye) and ••• for the statement or editing. A tap on the card opens its statement.
 */
export function WalletList({ wallets, onSelect, reorderMode, onMove, muted, hideProvider, primaryId, onEdit }: WalletListProps) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const family = workspace?.type === "FAMILY"
  const members = useMembers(family ? workspace.id : undefined).data ?? []
  const ownerName = (w: Wallet) => members.find((m) => m.user_id === w.owner_id)?.display_name

  return (
    <div className={cn("space-y-2", muted && "opacity-70")}>
      {wallets.map((wallet, index) => {
        const other = wallet.currency === "USD" ? "KHR" : "USD"
        const content = (
          <>
            <WalletAvatar icon={wallet.icon} color={wallet.color} name={wallet.name} />
            <span className="min-w-0 flex-1 text-left">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium" title={wallet.name}>{walletDisplayName(wallet)}</span>
                {wallet.id === primaryId && (
                  <span
                    className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-px text-[11px] leading-4 font-semibold text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300"
                    title={t("wallets.primaryHint")}
                  >
                    {t("wallets.primary")}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                {family && (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium",
                      wallet.visibility === "PERSONAL"
                        ? "bg-violet-500/12 text-violet-700 dark:text-violet-300"
                        : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
                    )}
                  >
                    {wallet.visibility === "PERSONAL" ? <UserIcon className="size-2.5" aria-hidden /> : <UsersIcon className="size-2.5" aria-hidden />}
                    {wallet.visibility === "PERSONAL" ? (ownerName(wallet) ?? t("wallet.PERSONAL")) : t("wallet.sharedShort")}
                  </span>
                )}
                <span className="truncate">
                  {isCard(wallet) ? `${t("card.kind")} · ` : hideProvider ? "" : `${pick(getProvider(wallet.icon).name, locale)} · `}
                  {wallet.currency}
                  {wallet.account_no ? ` · ${maskAccount(wallet.account_no)}` : ""}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <Amount value={wallet.balance} currency={wallet.currency} className="block text-sm font-semibold whitespace-nowrap tabular-nums" />
              {wallet.od_limit ? (
                // Overdraft line: what can still be spent (balance + OD), like the bank's "available".
                <span className="block text-xs text-muted-foreground">
                  {t("od.short")} <Amount value={wallet.balance + wallet.od_limit} currency={wallet.currency} />
                </span>
              ) : (
                <Amount
                  value={convert(wallet.balance, wallet.currency, other, khrPerUsd)}
                  currency={other}
                  className="block text-xs text-muted-foreground"
                />
              )}
            </span>
          </>
        )

        const bar = <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", KIND_ACCENT[walletKind(wallet)].bar)} />
        const frame = "relative overflow-hidden rounded-2xl border bg-card shadow-xs"

        if (reorderMode) {
          return (
            <div key={wallet.id} className={cn(frame, "flex items-center gap-3 py-3 pr-2 pl-5")}>
              {bar}
              {content}
              <span className="flex flex-col">
                <button
                  type="button"
                  className="rounded-md p-1 hover:bg-muted disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => onMove?.(index, -1)}
                  aria-label={`${t("wallets.moveUp")}: ${wallet.name}`}
                >
                  <ChevronUpIcon className="size-4" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1 hover:bg-muted disabled:opacity-30"
                  disabled={index === wallets.length - 1}
                  onClick={() => onMove?.(index, 1)}
                  aria-label={`${t("wallets.moveDown")}: ${wallet.name}`}
                >
                  <ChevronDownIcon className="size-4" />
                </button>
              </span>
            </div>
          )
        }

        return (
          <div key={wallet.id} className={cn(frame, "transition-colors hover:bg-muted/40")}>
            {bar}
            <div className="flex items-center">
              <button type="button" onClick={() => onSelect?.(wallet)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 text-left">
                {content}
              </button>
              {onSelect && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mr-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`${t("wallets.menu")}: ${wallet.name}`}
                    >
                      <EllipsisIcon className="size-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSelect(wallet)}>
                      <ReceiptTextIcon />
                      {t("wallets.viewStatement")}
                    </DropdownMenuItem>
                    {onEdit && (
                      <DropdownMenuItem onSelect={() => onEdit(wallet)}>
                        <PencilIcon />
                        {t("wallets.edit")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {/* Credit card: available credit, usage and the next due date. */}
            {isCard(wallet) && (
              <span className="block pr-4 pb-3 pl-[68px]">
                <CardMeter wallet={wallet} compact />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
