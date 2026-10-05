"use client"

import { format, parseISO } from "date-fns"
import { ArrowDownLeftIcon, ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, ImageIcon, MegaphoneIcon, PencilIcon, PhoneIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { BankInstallmentButton } from "@/components/debts/bank-installment-button"
import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { LoanDocuments } from "@/components/debts/loan-documents"
import { DebtProgress } from "@/components/debts/debt-progress"
import { ReminderSheet } from "@/components/debts/reminder-sheet"
import { RepaymentSheet } from "@/components/debts/repayment-sheet"
import { nextInstallmentAmount, ScheduleCard } from "@/components/debts/schedule-card"
import { TrancheSheet } from "@/components/debts/tranche-sheet"
import { RecordedBy } from "@/components/family/member-avatar"
import { UrgencyBadge } from "@/components/debts/urgency-badge"
import { InsuranceCard, InsuredBadge } from "@/components/debts/insurance-card"
import { Amount } from "@/components/money/amount"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { WalletAvatar } from "@/components/wallets/wallet-avatar"
import { stepUp } from "@/components/security/step-up"
import { useActiveWorkspace, useDebtMutations, useDebts, useReceiptUrl, useRepayments, useTranches, useWallets } from "@/lib/data/hooks"
import { RepaymentTooLargeError, type Attribution } from "@/lib/data/types"
import { useIslamicSettings } from "@/lib/islamic-settings"
import { debtStatus, estimatedInterest, remaining } from "@/lib/debts"
import { isBankLoan } from "@/lib/loans/installments"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { formatPhoneLocal } from "@/lib/format"
import { usePrefsStore } from "@/stores/prefs-store"

const fmtDate = (iso: string) => format(parseISO(iso), "dd/MM/yyyy")

type TimelineEntry = {
  kind: "start" | "more" | "repay"
  id: string
  date: string
  created: string
  amount: number
  walletId: string | null
  note: string | null
  slip: string | null
  row: Attribution | null
  /** What is left after this entry. */
  balance: number
}

/** Small "slip" chip on a timeline row; opens the photo full screen. */
function SlipButton({ path }: { path: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const url = useReceiptUrl(open ? path : null)
  return (
    <>
      <Button size="icon" variant="ghost" className="size-8 text-primary" onClick={() => setOpen(true)} aria-label={t("debt.slip")}>
        <ImageIcon className="size-4" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={url} alt={t("debt.slip")} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-white/80">…</span>
          )}
          <Button size="icon" variant="secondary" className="absolute top-4 right-4 rounded-full" onClick={() => setOpen(false)} aria-label={t("common.close")}>
            <XIcon />
          </Button>
        </div>
      )}
    </>
  )
}

export default function DebtDetailPage() {
  const t = useT()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const hideBalances = usePrefsStore((s) => s.hideBalances)
  const { workspace } = useActiveWorkspace()
  const debtsQuery = useDebts(workspace?.id)
  const wallets = useWallets(workspace?.id).data ?? []
  const repaymentsQuery = useRepayments(workspace?.id, id)
  const islamicOn = useIslamicSettings().settings.enabled
  const tranchesQuery = useTranches(workspace?.id, id)
  const { remove, deleteRepayment, deleteTranche, update } = useDebtMutations(workspace?.id)

  const [payOpen, setPayOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

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
  const bankLoan = isBankLoan(debt)
  // A bank loan's interest is in its schedule (and booked per installment), not an estimate.
  const interest = bankLoan ? 0 : estimatedInterest(debt)
  const repayments = repaymentsQuery.data ?? []
  const tranches = tranchesQuery.data ?? []
  // Timeline, oldest first: the first borrowing, later top-ups and repayments, each with the balance after it.
  const factor = debt.currency === "KHR" ? 1 : 100
  const round = (n: number) => Math.round(n * factor) / factor
  const timeline: TimelineEntry[] = []
  {
    const firstAmount = round(debt.total_amount - tranches.reduce((sum, x) => sum + x.amount, 0))
    const events: Omit<TimelineEntry, "balance">[] = [
      { kind: "start", id: debt.id, date: debt.start_date, created: "", amount: firstAmount, walletId: null, note: null, slip: null, row: null },
      ...tranches.map((x) => ({
        kind: "more" as const,
        id: x.id,
        date: x.tranche_date,
        created: x.created_at,
        amount: x.amount,
        walletId: x.wallet_id,
        note: x.note,
        slip: x.attachment_path,
        row: { created_by: x.created_by, created_by_name: null },
      })),
      ...repayments.map((r) => ({
        kind: "repay" as const,
        id: r.id,
        date: r.payment_date,
        created: r.created_at,
        amount: r.amount_paid,
        walletId: r.wallet_id,
        note: r.note,
        slip: r.attachment_path ?? null,
        row: r,
      })),
    ]
    events.sort((a, b) => (a.kind === "start" ? -1 : b.kind === "start" ? 1 : a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.created.localeCompare(b.created)))
    let balance = 0
    for (const e of events) {
      if (e.kind === "start" && e.amount <= 0) continue
      balance = Math.max(0, round(balance + (e.kind === "repay" ? -e.amount : e.amount)))
      timeline.push({ ...e, balance })
    }
  }

  const deleteDebt = async () => {
    if (!(await stepUp(t("debtForm.deleteConfirm", { name: debt.party_name })))) return
    await remove.mutateAsync(debt.id)
    toast.success(t("debtForm.deleted"))
    router.replace(`/debts?tab=${debt.type}`)
  }

  const removePayment = async (repaymentId: string, recordOnly: boolean) => {
    if (!window.confirm(t(recordOnly ? "debt.deleteRecordOnlyConfirm" : "debt.deletePaymentConfirm"))) return
    try {
      await deleteRepayment.mutateAsync(repaymentId)
      toast.success(t("debt.paymentDeleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  const removeTranche = async (trancheId: string) => {
    if (!window.confirm(t("tranche.deleteConfirm"))) return
    try {
      await deleteTranche.mutateAsync(trancheId)
      toast.success(t("tranche.deleted"))
    } catch (error) {
      toast.error(error instanceof RepaymentTooLargeError ? t("tranche.tooMuchRepaid") : t("common.error"))
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
              <PhoneIcon className="size-3.5" />{formatPhoneLocal(debt.contact_phone)}
            </a>
          )}
          {debt.note && <p className="text-sm text-muted-foreground">{debt.note}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <UrgencyBadge debt={debt} />
            <InsuredBadge debt={debt} />
            {debt.qard_hasan && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {t("debt.qardHasanBadge")}
              </span>
            )}
          </div>
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

        <InsuranceCard debt={debt} />

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

        {!settled && bankLoan && (
          <div className="space-y-2">
            <BankInstallmentButton debt={debt} wallets={wallets} />
            <Button variant="outline" className="h-10 w-full" onClick={() => setPayOpen(true)}>
              <ArrowUpRightIcon />
              {t("bankLoan.prepay")}
            </Button>
          </div>
        )}
        {!settled && !bankLoan && (
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

      <ScheduleCard debt={debt} />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-medium text-muted-foreground">{t("debt.history")}</h2>
          {debt.schedule_principal == null && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setMoreOpen(true)}>
              <PlusIcon />
              {t(`debt.addMore${debt.type}`)}
            </Button>
          )}
        </div>
        {timeline.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("debt.noHistory")}</p>
        ) : (
          <Card className="gap-0 divide-y overflow-hidden py-0">
            {timeline.map((e) => {
              const wallet = e.walletId ? walletById.get(e.walletId) : undefined
              const isRepay = e.kind === "repay"
              const label = isRepay ? t("debt.timelineRepay") : e.kind === "more" ? t(`debt.timelineMore${debt.type}`) : t(`debt.timelineBorrow${debt.type}`)
              const detail = [e.kind === "start" ? null : wallet ? wallet.name : t("debt.recordOnly"), e.note].filter(Boolean).join(" · ")
              return (
                <div key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-4 py-3">
                  {wallet ? (
                    <WalletAvatar icon={wallet.icon ?? null} color={wallet.color} name={wallet.name} className="size-9 text-[10px]" />
                  ) : (
                    <span
                      className={
                        isRepay
                          ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                          : "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      }
                    >
                      {isRepay ? <CheckIcon className="size-4" aria-hidden /> : <PlusIcon className="size-4" aria-hidden />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {label} <span className="font-normal text-muted-foreground">· {fmtDate(e.date)}</span>
                    </p>
                    {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
                    {e.row && <RecordedBy row={e.row} className="mt-0.5 flex" />}
                  </div>
                  {e.slip && <SlipButton path={e.slip} />}
                  <div className="text-right">
                    <span className={isRepay ? "block text-sm font-semibold text-emerald-600 dark:text-emerald-400" : "block text-sm font-semibold"}>
                      {formatMoney(isRepay ? -e.amount : e.amount, debt.currency, { hidden: hideBalances, signed: true })}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t("debt.balanceAfter", { amount: formatMoney(e.balance, debt.currency, { hidden: hideBalances }) })}
                    </span>
                  </div>
                  {e.kind === "start" ? (
                    <span className="size-8 shrink-0" aria-hidden />
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => (isRepay ? removePayment(e.id, !e.walletId) : removeTranche(e.id))}
                      aria-label={t("common.delete")}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              )
            })}
          </Card>
        )}
      </section>

      {/* Zakat (Islamic tools): money owed to me that I don't expect back isn't counted. */}
      {islamicOn && debt.type === "RECEIVABLE" && !settled && (
        <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("debt.doubtful")}</span>
            <span className="block text-xs text-muted-foreground">{t("debt.doubtfulHint")}</span>
          </span>
          <Switch
            checked={debt.doubtful ?? false}
            onCheckedChange={(on) => update.mutate({ id: debt.id, input: { doubtful: on } }, { onError: () => toast.error(t("common.error")) })}
            aria-label={t("debt.doubtful")}
          />
        </label>
      )}

      <LoanDocuments debt={debt} />

      <TrancheSheet open={moreOpen} onOpenChange={setMoreOpen} debt={debt} wallets={wallets} />
      <RepaymentSheet open={payOpen} onOpenChange={setPayOpen} debt={debt} wallets={wallets} initialAmount={nextInstallmentAmount(debt)} />
      <DebtFormSheet open={editOpen} onOpenChange={setEditOpen} workspaceId={workspace?.id} debt={debt} defaultType={debt.type} />
      {debt.type === "RECEIVABLE" && <ReminderSheet open={reminderOpen} onOpenChange={setReminderOpen} debt={debt} />}
    </div>
  )
}
