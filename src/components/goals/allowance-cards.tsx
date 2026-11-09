"use client"

import { BabyIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AllowanceSheet } from "@/components/goals/allowance-sheet"
import { Amount } from "@/components/money/amount"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { allowanceDue, weekdayName, type Allowance } from "@/lib/allowance"
import { useAllowanceMutations, useAllowances } from "@/lib/allowance-data"
import { cambodiaToday } from "@/lib/bills"
import { useWalletMutations } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const childWallets = (wallets: Wallet[]) => wallets.filter((w) => !w.archived_at && w.goal_target != null)

/** One tap: the week's pocket money as an ordinary transfer from the parent's wallet, and the week marked given. */
function useGive(workspaceId: string | undefined) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const walletMutations = useWalletMutations(workspaceId)
  const allowances = useAllowanceMutations()
  return async (a: Allowance, child: Wallet, from: Wallet | undefined, day: string) => {
    if (!from) {
      toast.error(t("allowance.noSource"))
      return
    }
    try {
      await walletMutations.transfer.mutateAsync({
        wallet_id: from.id,
        to_wallet_id: child.id,
        amount: a.amount,
        to_amount: convert(a.amount, from.currency, child.currency, khrPerUsd),
        exchange_rate: from.currency === child.currency ? null : khrPerUsd,
        note: t("allowance.note", { name: child.name }),
        transaction_date: new Date().toISOString(),
      })
      await allowances.given.mutateAsync({ id: a.id, day })
      toast.success(t("allowance.given", { name: child.name }))
    } catch {
      toast.error(t("allowance.failed"))
    }
  }
}

/**
 * Home (founder, 9/11/2026): «ថ្ងៃនេះ ប្រាក់ហោប៉ៅ ដារ៉ា $5 [ផ្ដល់]» — only on (or after a missed) allowance day, only
 * for someone who may move the money. Hidden otherwise.
 */
export function AllowanceDueCard({ workspaceId, wallets, editable }: { workspaceId: string | undefined; wallets: Wallet[]; editable: boolean }) {
  const t = useT()
  const children = childWallets(wallets)
  const list = useAllowances(children.map((w) => w.id)).data ?? []
  const give = useGive(workspaceId)
  const [busy, setBusy] = useState<string | null>(null)
  const today = cambodiaToday()
  const due = list.map((a) => ({ a, day: allowanceDue(a, today), child: children.find((w) => w.id === a.wallet_id) })).filter((x) => x.day && x.child)
  if (!editable || due.length === 0) return null
  return (
    <Card className="gap-2 px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <BabyIcon className="size-5 text-primary" aria-hidden />
        {t("allowance.dueTitle")}
      </span>
      {due.map(({ a, day, child }) => (
        <div key={a.id} className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-sm">{child!.name}</span>
          <Amount value={a.amount} currency={wallets.find((w) => w.id === a.from_wallet_id)?.currency ?? child!.currency} className="text-sm font-semibold" />
          <Button
            type="button"
            size="sm"
            className="h-11 min-w-20"
            disabled={busy === a.id}
            onClick={() => {
              setBusy(a.id)
              void give(a, child!, wallets.find((w) => w.id === a.from_wallet_id), day!).finally(() => setBusy(null))
            }}
          >
            {busy === a.id ? <Loader2Icon className="animate-spin" /> : t("allowance.give")}
          </Button>
        </div>
      ))}
    </Card>
  )
}

/** Goals page: the children's pocket money — each child, the amount and the day — and «add a child». */
export function AllowanceSection({ workspaceId, wallets, editable }: { workspaceId: string | undefined; wallets: Wallet[]; editable: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const children = childWallets(wallets)
  const list = useAllowances(children.map((w) => w.id)).data ?? []
  const mutations = useAllowanceMutations()
  const [open, setOpen] = useState(false)
  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BabyIcon className="size-5 text-primary" aria-hidden />
          {t("allowance.title")}
        </span>
        {editable && (
          <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => setOpen(true)}>
            <PlusIcon />
            {t("allowance.add")}
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("allowance.howItWorks")}</p>
      ) : (
        list.map((a) => {
          const child = children.find((w) => w.id === a.wallet_id)
          const from = wallets.find((w) => w.id === a.from_wallet_id)
          if (!child) return null
          return (
            <div key={a.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{child.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("allowance.every", { day: weekdayName(a.weekday, locale) })} · {from?.name ?? t("allowance.noSource")}
                </span>
              </span>
              <Amount value={a.amount} currency={from?.currency ?? child.currency} className="font-semibold" />
              {editable && (
                <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t("allowance.stop")} onClick={() => void mutations.remove.mutateAsync(a.id)}>
                  <Trash2Icon />
                </Button>
              )}
            </div>
          )
        })
      )}
      <AllowanceSheet open={open} onOpenChange={setOpen} workspaceId={workspaceId} wallets={wallets} />
    </Card>
  )
}
