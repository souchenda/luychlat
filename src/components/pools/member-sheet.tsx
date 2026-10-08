"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { parseAmount, roundMoney } from "@/lib/money"
import type { PoolMember, PoolSnapshot } from "@/lib/pool"
import { usePoolMutations } from "@/lib/pools"
import { useMoney } from "@/lib/use-money"

/**
 * Edit a share: the family's name and its amount (the pool's target follows the
 * shares). Remove a member who dropped out — one who already paid is refunded from
 * the pool, after a clear confirmation.
 */
export function MemberSheet({ pool, member, onOpenChange }: { pool: PoolSnapshot; member: PoolMember | null; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const money = useMoney()
  const { updateMember, removeMember } = usePoolMutations()
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [confirmRefund, setConfirmRefund] = useState<number | null>(null)

  useEffect(() => {
    if (!member) return
    setName(member.name)
    setAmount(member.pledged > 0 ? String(member.pledged) : "")
    setConfirmRefund(null)
  }, [member])

  if (!member) return null
  const unit = pool.unit === "FAMILY"

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 60)
    const pledged = amount.trim() ? parseAmount(amount) : 0
    if (!clean) return void toast.error(t("gold.nameRequired"))
    if (!(pledged >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    updateMember.mutate(
      { memberId: member.id!, name: clean, pledged: roundMoney(pledged, pool.currency) },
      { onSuccess: () => (toast.success(t("pool.memberSaved")), onOpenChange(false)), onError: () => toast.error(t("common.error")) },
    )
  }

  const remove = (refund: boolean) =>
    removeMember.mutate(
      { memberId: member.id!, refund },
      {
        onSuccess: (r) => {
          if (r.status === "paid") return setConfirmRefund(Number(r.paid ?? member.paid))
          toast.success(r.refunded ? t("pool.memberRefunded", { name: member.name, amount: money(Number(r.refunded), pool.currency) }) : t("pool.memberRemoved", { name: member.name }))
          onOpenChange(false)
        },
        onError: (e) =>
          toast.error(/insufficient_balance/.test((e as Error).message ?? "") ? t("pool.refundTooLow") : t("common.error")),
      },
    )

  return (
    <BottomSheet open={Boolean(member)} onOpenChange={onOpenChange} title={t(unit ? "pool.editFamily" : "pool.editMember")}>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pm-name">{t("pool.memberName")}</Label>
          <Input id="pm-name" className="h-11" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-amount">{t("pool.shareAmount", { currency: pool.currency === "USD" ? "$" : "៛" })}</Label>
          <Input id="pm-amount" className="h-11 tabular-nums" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {member.paid > 0 && <p className="text-xs text-muted-foreground">{t("pool.alreadyPaid", { amount: money(member.paid, pool.currency) })}</p>}
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={updateMember.isPending}>
          {updateMember.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>

        {confirmRefund === null ? (
          <Button type="button" variant="outline" className="h-11 w-full text-destructive" disabled={removeMember.isPending} onClick={() => remove(false)}>
            {removeMember.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            {t(unit ? "pool.removeFamily" : "pool.removeMember")}
          </Button>
        ) : (
          <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm">{t("pool.removePaidConfirm", { amount: money(confirmRefund, pool.currency) })}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setConfirmRefund(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="button" variant="destructive" className="h-10" disabled={removeMember.isPending} onClick={() => remove(true)}>
                {removeMember.isPending && <Loader2Icon className="animate-spin" />}
                {t("pool.removeAndRefund")}
              </Button>
            </div>
          </div>
        )}
      </form>
    </BottomSheet>
  )
}
