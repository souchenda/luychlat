"use client"

import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, UserIcon, UsersIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { useActiveWorkspace, useMembers } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert } from "@/lib/money"
import { cn } from "@/lib/utils"
import { getProvider } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletAvatar } from "./wallet-avatar"

type WalletListProps = {
  wallets: Wallet[]
  onSelect?: (wallet: Wallet) => void
  /** Shows up/down controls instead of opening wallets. */
  reorderMode?: boolean
  onMove?: (index: number, direction: -1 | 1) => void
  muted?: boolean
}

export function WalletList({ wallets, onSelect, reorderMode, onMove, muted }: WalletListProps) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const family = workspace?.type === "FAMILY"
  const members = useMembers(family ? workspace.id : undefined).data ?? []
  const ownerName = (w: Wallet) => members.find((m) => m.user_id === w.owner_id)?.display_name

  return (
    <Card className={cn("gap-0 divide-y py-0", muted && "opacity-70")}>
      {wallets.map((wallet, index) => {
        const other = wallet.currency === "USD" ? "KHR" : "USD"
        const content = (
          <>
            <WalletAvatar icon={wallet.icon} color={wallet.color} />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{wallet.name}</span>
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
                  {getProvider(wallet.icon).name[locale]} · {wallet.currency}
                </span>
              </span>
            </span>
            <span className="text-right">
              <Amount value={wallet.balance} currency={wallet.currency} className="block text-sm font-semibold" />
              <Amount
                value={convert(wallet.balance, wallet.currency, other, khrPerUsd)}
                currency={other}
                className="block text-xs text-muted-foreground"
              />
            </span>
          </>
        )

        if (reorderMode) {
          return (
            <div key={wallet.id} className="flex items-center gap-3 px-4 py-3">
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
          <button
            key={wallet.id}
            type="button"
            onClick={() => onSelect?.(wallet)}
            className="flex w-full items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60"
          >
            {content}
            {onSelect && <ChevronRightIcon className="size-4 text-muted-foreground" />}
          </button>
        )
      })}
    </Card>
  )
}
