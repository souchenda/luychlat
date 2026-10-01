"use client"

import { format, parseISO } from "date-fns"
import { ArrowDownLeftIcon, ArrowLeftIcon, ArrowUpRightIcon, MegaphoneIcon, PencilIcon, PhoneIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { DebtProgress } from "@/components/debts/debt-progress"
import { ReminderSheet } from "@/components/debts/reminder-sheet"
import { RepaymentSheet } from "@/components/debts/repayment-sheet"
import { UrgencyBadge } from "@/components/debts/urgency-badge"
import { Amount } from "@/components/money/amount"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { WalletAvatar } from "@/components/wallets/wallet-avatar"
import { useActiveWorkspace, useDebtMutations, useDebts, useRepayments, useWallets } from "@/lib/data/hooks"
import { debtStatus, estimatedInterest, remaining } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { formatNationalNumber, toNationalNumber } from "@/lib/phone"
import { usePrefsStore } from "@/stores/prefs-store"

const fmtDate = (iso: string) => format(parseISO(iso), "dd/MM/yyyy")

export default function DebtDetailPage() {
  const t = useT()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const hideBalances = usePrefsStore((s) => s.hideBalances)
  const { workspace } = useActiveWorkspace()
  const debtsQuery = useDebts(workspace?.id)
  const wallets = useWallets(workspace?.id).data ?? []
  const repaymentsQuery = useRepayments(workspace?.id, id)
  const { remove, deleteRepayment } = useDebtMutations(workspace?.id)

  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)

  const debt = debtsQuery.data?.find((d) => d.id === id)
  const walletById = new Map(wallets.map((w) => [w.id, w]))

  if (debtsQuery.isLoading) return <Skeleton className="h-80 w-full rounded-xl" />
  if (!debt) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">{t("debt.notFound")}</p>
        <Button asChild variant="outline">
          <Link href="/debts">{t("common.back")}</Link>
        </Button>
      </div>
    )
  }

  const settled = debtStatus(debt) === "SETTLED"
  const interest = estimatedInterest(debt)
  const repayments = repaymentsQuery.data ?? []

  const deleteDebt = async () => {
    if (!window.confirm(t("debtForm.deleteConfirm", { name: debt.party_name }))) return
    await remove.mutateAsync(debt.id)
    toast.success(t("debtForm.deleted"))
    router.replace(`/debts?tab=${debt.type}`)
  }

  const removePayment = async (repaymentId: string) => {
    if (!window.confirm(t("debt.deletePaymentConfirm"))) return
    try {
      await deleteRepayment.mutateAsync(repaymentId)
      toast.success(t("debt.paymentDeleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href={`/debts?tab=${debt.type}`}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
          {debt.type === "PAYABLE" ? <ArrowUpRightIcon className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden /> : <ArrowDownLeftIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />}
          {t(`debts.${debt.type}`)}
        </span>
        <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)} aria-label={t("debtForm.edit")}>
          <PencilIcon />
        </Button>
        <Button size="icon" variant="ghost" className="text-destructive" onClick={deleteDebt} aria-label={t("common.delete")}>
          <Trash2Icon />
        </Button>
      </div>

      <Card className="gap-4 px-4 py-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{debt.party_name}</h1>
          {debt.contact_phone && (
            <a href={`tel:${debt.contact_phone}`} className="inline-flex items-center gap-1 text-sm text-primary">
              <PhoneIcon className="size-3.5" />0{formatNationalNumber(toNationalNumber(debt.contact_phone))}
            </a>
          )}
          {debt.note && <p className="text-sm text-muted-foreground">{debt.note}</p>}
          <UrgencyBadge debt={debt} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">{t("debt.total")}</p>
            <Amount value={debt.total_amount} currency={debt.currency} className="text-sm font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("debt.paid")}</p>
            <Amount value={debt.paid_amount} currency={debt.currency} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("debts.totalRemaining")}</p>
            <Amount value={remaining(debt)} currency={debt.currency} className="text-sm font-semibold" />
          </div>
        </div>

        <DebtProgress debt={debt} />

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>
            {t("debt.startedOn", { date: fmtDate(debt.start_date) })}
            {debt.due_date && ` · ${t("debt.dueOn", { date: fmtDate(debt.due_date) })}`}
          </p>
          {debt.interest_rate > 0 && (
            <p>
              {t("debt.interest", {
                rate: `${debt.interest_rate}${t(debt.interest_period === "MONTH" ? "debtForm.perMonth" : "debtForm.perYear")}`,
              })}
              {interest > 0 && ` · ${t("debt.interestEstimate", { amount: formatMoney(interest, debt.currency, { hidden: hideBalances }) })}`}
            </p>
          )}
        </div>

        {!settled && (
          <div className={debt.type === "RECEIVABLE" ? "grid grid-cols-2 gap-2" : ""}>
            <Button className="h-11 w-full" onClick={() => setPayOpen(true)}>
              {debt.type === "PAYABLE" ? <ArrowUpRightIcon /> : <ArrowDownLeftIcon />}
              {t(`debt.record${debt.type}`)}
            </Button>
            {debt.type === "RECEIVABLE" && (
              <Button variant="outline" className="h-11 w-full" onClick={() => setReminderOpen(true)}>
                <MegaphoneIcon />
                {t("reminder.button")}
              </Button>
            )}
          </div>
        )}
      </Card>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("debt.history")}</h2>
        {repayments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("debt.noPayments")}</p>
        ) : (
          <Card className="gap-0 divide-y overflow-hidden py-0">
            {repayments.map((r) => {
              const wallet = walletById.get(r.wallet_id)
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <WalletAvatar icon={wallet?.icon ?? null} color={wallet?.color} className="size-9 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{fmtDate(r.payment_date)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[wallet?.name, r.note].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Amount value={r.amount_paid} currency={debt.currency} className="text-sm font-semibold" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removePayment(r.id)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      <RepaymentSheet open={payOpen} onOpenChange={setPayOpen} debt={debt} wallets={wallets} />
      <DebtFormSheet open={editOpen} onOpenChange={setEditOpen} workspaceId={workspace?.id} debt={debt} defaultType={debt.type} />
      {debt.type === "RECEIVABLE" && <ReminderSheet open={reminderOpen} onOpenChange={setReminderOpen} debt={debt} />}
    </div>
  )
}
