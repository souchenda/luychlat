"use client"

import { formatDuration, formatOverdue } from "@/lib/format"
import { CheckIcon, ChevronDownIcon, ExternalLinkIcon, Loader2Icon, PlusIcon, ReceiptIcon, ShieldCheckIcon, Undo2Icon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { BillSheet } from "@/components/bills/bill-sheet"
import { EvHomeCard } from "@/components/bills/ev-home-card"
import { NssfVault } from "@/components/bills/nssf-vault"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { BILL_EMOJI, NSSF_URL, daysUntil, nextDue, nssfAmountFor, useBillMutations, useBills, useNssfMembers, type Bill } from "@/lib/bills"
import { canWrite, useActiveWorkspace, useCategories, useWallets } from "@/lib/data/hooks"
import { dayDate } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { HolyDayCard } from "@/components/bills/holy-day-card"

const NO_WALLET = "__none__"

/** "Paid": closes the next due date, optionally logging the expense in a wallet. */
function PaySheet({ bill, due, workspaceId, onClose }: { bill: Bill; due: string; workspaceId: string; onClose: () => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const wallets = (useWallets(workspaceId).data ?? []).filter((w) => !w.archived_at)
  const { markPaid } = useBillMutations(workspaceId)
  const [walletId, setWalletId] = useState<string>(wallets.find((w) => w.currency === bill.currency)?.id ?? wallets[0]?.id ?? NO_WALLET)
  const [amount, setAmount] = useState(String(bill.amount))

  const submit = async () => {
    const value = parseAmount(amount)
    if (walletId !== NO_WALLET && !(value > 0)) return void toast.error(t("common.error"))
    try {
      const r = await markPaid.mutateAsync({ id: bill.id, walletId: walletId === NO_WALLET ? null : walletId, amount: walletId === NO_WALLET ? null : value })
      toast.success(t("bills.paidDone", { date: dayDate(new Date(`${r.next_due}T12:00:00`), locale) }))
      onClose()
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={t("bills.payTitle", { name: bill.title })} description={t("bills.payFor", { date: dayDate(new Date(`${due}T12:00:00`), locale) })}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("bills.payFrom")}</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger className="h-12! w-full" aria-label={t("bills.payFrom")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {wallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} · {w.currency === "USD" ? "$" : "៛"}
                </SelectItem>
              ))}
              <SelectItem value={NO_WALLET}>{t("bills.noLog")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {walletId !== NO_WALLET && (
          <div className="space-y-2">
            <Label htmlFor="pay-amount">
              {t("bills.amount")} ({bill.currency === "USD" ? "$" : "៛"})
            </Label>
            <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-xl font-semibold tabular-nums" />
          </div>
        )}
        <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={markPaid.isPending}>
          {markPaid.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {t("bills.markPaid")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/** A short NSSF explainer; amounts and benefits are set by NSSF, so it points there for the current ones. */
function NssfGuide() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Card className="gap-0 py-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ShieldCheckIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-sm font-semibold">{t("bills.nssfGuideTitle")}</span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <p>{t("bills.nssfGuide1")}</p>
          <p>{t("bills.nssfGuide2")}</p>
          <p>{t("bills.nssfGuide3")}</p>
          <a href={NSSF_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary [&_svg]:size-3.5">
            {t("bills.nssfLink")} <ExternalLinkIcon />
          </a>
        </div>
      )}
    </Card>
  )
}

/** The last due date was paid within the past month — the card shows "✅ បង់រួច" until the next one comes up. */
const recentlyPaid = (bill: Bill) => Boolean(bill.paid_until && daysUntil(bill.paid_until) >= -31 && daysUntil(bill.paid_until) <= 31)

export default function BillsPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const bills = useBills(ws)
  const categories = useCategories(ws).data ?? []
  const [sheet, setSheet] = useState<{ open: boolean; bill: Bill | null }>({ open: false, bill: null })
  const [paying, setPaying] = useState<{ bill: Bill; due: string } | null>(null)
  const nssfMembers = (useNssfMembers().data ?? []).filter((m) => m.is_active).length
  const { save, unmarkPaid } = useBillMutations(ws)
  /** «មិនទាន់បង់»: a bill marked paid by mistake goes back to unpaid (after a confirm). */
  const undoPaid = async (bill: Bill) => {
    if (!window.confirm(t("bills.unpayConfirm", { name: bill.title }))) return
    try {
      const r = await unmarkPaid.mutateAsync(bill.id)
      toast.success(t(r.expense_removed ? "bills.unpaidDoneExpense" : r.expense_kept ? "bills.unpaidDoneKept" : "bills.unpaidDone"))
    } catch {
      toast.error(t("common.error"))
    }
  }
  /** The NSSF bill's amount no longer matches the active members: offer to update it. */
  const nssfSuggestion = (bill: Bill) =>
    bill.kind === "NSSF" && bill.currency === "KHR" && nssfMembers > 0 && nssfAmountFor(nssfMembers, bill.frequency) !== bill.amount ? nssfAmountFor(nssfMembers, bill.frequency) : null

  const rows = useMemo(
    () =>
      (bills.data ?? [])
        .map((b) => ({ bill: b, due: nextDue(b) }))
        .sort((a, b) => Number(b.bill.is_active) - Number(a.bill.is_active) || a.due.localeCompare(b.due)),
    [bills.data],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ReceiptIcon className="size-5 text-primary" aria-hidden />
          {t("bills.title")}
        </h1>
        {editable && ws && (
          <Button size="sm" onClick={() => setSheet({ open: true, bill: null })}>
            <PlusIcon />
            {t("bills.add")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("bills.hint")}</p>

      <HolyDayCard />

      {bills.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !rows.length ? (
        <Card className="items-center gap-2 px-6 py-8 text-center">
          <ReceiptIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("bills.empty")}</p>
          {editable && ws && (
            <Button size="sm" variant="outline" onClick={() => setSheet({ open: true, bill: null })}>
              <PlusIcon />
              {t("bills.add")}
            </Button>
          )}
        </Card>
      ) : (
        <Card className="gap-0 divide-y py-0">
          {rows.map(({ bill, due }) => {
            const left = daysUntil(due)
            const status = !bill.is_active ? "off" : left < 0 ? "overdue" : left === 0 ? "today" : left <= 3 ? "soon" : "later"
            return (
              <div key={bill.id} className={cn("flex items-center gap-3 px-4 py-3", !bill.is_active && "opacity-60")}>
                <button type="button" onClick={() => editable && setSheet({ open: true, bill })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="text-2xl" aria-hidden>
                    {BILL_EMOJI[bill.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{bill.title}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular-nums">
                      {formatMoney(bill.amount, bill.currency, { hidden })} · {t(bill.frequency === "MONTHLY" ? "bills.monthly" : "bills.yearly")}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        status === "overdue" ? "font-medium text-rose-600 dark:text-rose-400" : status === "today" || status === "soon" ? "font-medium text-amber-600" : "text-muted-foreground",
                      )}
                    >
                      {/* Unpaid vs paid, never confused: "⏳ មិនទាន់បង់" until it is marked paid, then "✅ បង់រួច". */}
                      {status !== "off" && bill.kind !== "DEPOSIT" && (
                        <span className={cn("font-medium", recentlyPaid(bill) && status === "later" ? "text-emerald-700 dark:text-emerald-400" : "")}>
                          {t(recentlyPaid(bill) && status === "later" ? "bills.paidBadge" : "bills.unpaidBadge")}
                          {" · "}
                        </span>
                      )}
                      {status === "off"
                        ? t("bills.paused")
                        : status === "overdue"
                          ? formatOverdue(due, locale)
                          : status === "today"
                            ? t("bills.dueToday")
                            : t("bills.dueIn", { duration: formatDuration(left, "remaining", locale), date: dayDate(new Date(`${due}T12:00:00`), locale) })}
                    </span>
                  </span>
                </button>
                {editable && bill.is_active && nssfSuggestion(bill) !== null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-auto max-w-28 px-2 py-1 text-[11px] leading-tight whitespace-normal text-primary"
                    disabled={save.isPending}
                    onClick={() => {
                      const input = {
                        title: bill.title,
                        kind: bill.kind,
                        amount: nssfSuggestion(bill)!,
                        currency: bill.currency,
                        frequency: bill.frequency,
                        due_day: bill.due_day,
                        due_date: bill.due_date,
                        nssf_type: bill.nssf_type,
                        remind_days: bill.remind_days,
                        category_id: bill.category_id,
                        is_active: bill.is_active,
                      }
                      void save.mutateAsync({ id: bill.id, input }).then(() => toast.success(t("bills.saved")))
                    }}
                  >
                    {t("nssf.updateBill", { count: nssfMembers, amount: formatMoney(nssfSuggestion(bill)!, "KHR") })}
                  </Button>
                )}
                {bill.kind === "DEPOSIT" ? (
                  // A deposit's maturity: money coming back — nothing to mark paid.
                  <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">{t("bills.depositMatures")}</span>
                ) : editable && bill.is_active && bill.debt_id ? (
                  // A loan's bill is paid on the loan (each installment), which keeps this one in step.
                  <Button asChild size="sm" variant={status === "later" ? "outline" : "default"}>
                    <Link href="/debts?tab=PAYABLE">{t("bills.payOnLoan")}</Link>
                  </Button>
                ) : editable && bill.is_active &&
                  (recentlyPaid(bill) && status === "later" ? (
                    // Paid ("✅ បង់រួច" above): the only action is to undo a mistake.
                    <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={unmarkPaid.isPending} onClick={() => void undoPaid(bill)}>
                      <Undo2Icon />
                      {t("bills.unpay")}
                    </Button>
                  ) : (
                    // Unpaid: one plain action — «បង់រួច».
                    <Button size="sm" variant={status === "later" ? "outline" : "default"} onClick={() => setPaying({ bill, due })}>
                      {t("bills.paid")}
                    </Button>
                  ))}
              </div>
            )
          })}
        </Card>
      )}

      {ws && <EvHomeCard workspaceId={ws} editable={editable} />}

      <NssfVault />

      <NssfGuide />

      {ws && <BillSheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} workspaceId={ws} bill={sheet.bill} categories={categories} />}
      {paying && ws && <PaySheet bill={paying.bill} due={paying.due} workspaceId={ws} onClose={() => setPaying(null)} />}
    </div>
  )
}
