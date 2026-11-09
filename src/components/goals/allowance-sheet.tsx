"use client"

import { Loader2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { weekdayName } from "@/lib/allowance"
import { useAllowanceMutations } from "@/lib/allowance-data"
import { useWalletMutations } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

/**
 * «បន្ថែមប្រាក់ហោប៉ៅកូន» (founder, 9/11/2026): the child's name, what they save for (the goal's target), the weekly amount,
 * the day, and the parent's wallet it comes from. Creates the child's savings goal («👶», goal_kids) in the wallet's
 * currency and its allowance (lib/allowance-data.ts). Nothing moves now: Home asks on the day.
 */
export function AllowanceSheet({ open, onOpenChange, workspaceId, wallets }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string | undefined; wallets: Wallet[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const walletMutations = useWalletMutations(workspaceId)
  const allowances = useAllowanceMutations()
  const sources = wallets.filter((w) => !w.archived_at && w.goal_target == null && w.kind !== "CREDIT_CARD")
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [amount, setAmount] = useState("")
  const [weekday, setWeekday] = useState(1)
  const [from, setFrom] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName("")
    setTarget("")
    setAmount("")
    setWeekday(1)
    setFrom(sources[0]?.id ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset once per opening
  }, [open])

  const source = sources.find((w) => w.id === from)
  const currency = source?.currency ?? "USD"
  const weekly = roundMoney(parseAmount(amount) || 0, currency)
  const goal = roundMoney(parseAmount(target) || 0, currency)
  const ok = name.trim() !== "" && weekly > 0 && goal > 0 && Boolean(source)

  const save = async () => {
    if (!ok || !source) return
    setBusy(true)
    try {
      const wallet = await walletMutations.create.mutateAsync({
        name: name.trim(),
        icon: "goal_kids",
        color: null,
        visibility: "SHARED",
        currency,
        balance: 0,
        goal_target: goal,
        goal_date: null,
      })
      await allowances.save.mutateAsync({ wallet_id: wallet.id, from_wallet_id: source.id, amount: weekly, weekday })
      toast.success(t("allowance.saved", { name: name.trim() }))
      onOpenChange(false)
    } catch {
      toast.error(t("allowance.failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("allowance.new")} description={t("allowance.howItWorks")}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="allowance-name">{t("allowance.childName")}</Label>
          <Input id="allowance-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-11" />
        </div>
        <WalletSelect wallets={sources} value={from} onChange={setFrom} label={t("allowance.from")} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="allowance-amount">{t("allowance.weekly")}</Label>
            <Input id="allowance-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={currency === "USD" ? "$5.00" : "20,000៛"} className="h-11 tabular-nums" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowance-target">{t("allowance.target")}</Label>
            <Input id="allowance-target" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder={currency === "USD" ? "$80.00" : "320,000៛"} className="h-11 tabular-nums" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("allowance.day")}</Label>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("allowance.day")}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={weekday === d}
                onClick={() => setWeekday(d)}
                className={cn("min-h-11 rounded-xl border px-1 text-sm", weekday === d ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
              >
                {weekdayName(d, locale)}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" className="h-12 w-full text-base" disabled={!ok || busy} onClick={() => void save()}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}
