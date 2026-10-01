"use client"

import { format } from "date-fns"
import { ArrowRightIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import type { Transaction, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"

export function TransferList({ transfers, wallets }: { transfers: Transaction[]; wallets: Wallet[] }) {
  const t = useT()
  const byId = new Map(wallets.map((w) => [w.id, w]))

  if (transfers.length === 0) {
    return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("transfer.none")}</p>
  }

  return (
    <Card className="gap-0 divide-y py-0">
      {transfers.map((tx) => {
        const from = byId.get(tx.wallet_id)
        const to = tx.to_wallet_id ? byId.get(tx.to_wallet_id) : undefined
        return (
          <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                <span className="truncate">{from?.name ?? "—"}</span>
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{to?.name ?? "—"}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {format(new Date(tx.transaction_date), "dd/MM/yyyy HH:mm")}
                {tx.note && ` · ${tx.note}`}
              </p>
            </div>
            <div className="text-right">
              <Amount value={tx.amount} currency={tx.currency} className="block text-sm font-semibold" />
              {to && to.currency !== tx.currency && tx.to_amount !== null && (
                <Amount value={tx.to_amount} currency={to.currency} className="block text-xs text-muted-foreground" />
              )}
            </div>
          </div>
        )
      })}
    </Card>
  )
}
