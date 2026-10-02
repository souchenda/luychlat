"use client"

import { Amount } from "@/components/money/amount"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"

import { WalletAvatar } from "./wallet-avatar"

export function WalletSelect({
  wallets,
  value,
  onChange,
  label,
}: {
  wallets: Wallet[]
  value: string
  onChange: (id: string) => void
  label: string
}) {
  const t = useT()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-14! w-full" aria-label={label}>
        <SelectValue placeholder={t("transfer.select")} />
      </SelectTrigger>
      <SelectContent>
        {wallets.map((w) => (
          <SelectItem key={w.id} value={w.id} className="py-2">
            <WalletAvatar icon={w.icon} color={w.color} name={w.name} className="size-8 text-[10px]" />
            <span className="flex flex-col items-start">
              <span>{w.name}</span>
              <Amount value={w.balance} currency={w.currency} className="text-xs text-muted-foreground" />
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
