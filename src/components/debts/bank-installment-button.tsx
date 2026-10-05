"use client"

import { BanknoteIcon, Loader2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { usableWallets, useProfile } from "@/lib/data/hooks"
import type { Debt, Wallet } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { rememberedWallet, rememberWallet, useLoanInstallmentMutations } from "@/lib/loans/bank-loan"
import { debtSchedule, installments, nextInstallment } from "@/lib/loans/installments"
import { formatMoney, roundMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

/** The next installment of a bank loan and what is still owed on it (principal left + interest + fee). */
export function nextBankInstallment(debt: Debt) {
  const schedule = debtSchedule(debt)
  if (!schedule) return null
  const next = nextInstallment(installments(schedule, debt.paid_amount, todayDate(), debt.currency, true))
  if (!next) return null
  const principal = roundMoney(next.principal - next.paid, debt.currency)
  return { ...next, principal, total: roundMoney(principal + next.interest + next.fee, debt.currency), count: schedule.rows.length }
}

/**
 * "បង់រំលស់លើកទី N ($463.34)": one tap pays the next installment from the
 * wallet used last time (picked once, then remembered on this device), with Undo.
 */
export function BankInstallmentButton({ debt, wallets }: { debt: Debt; wallets: Wallet[] }) {
  const t = useT()
  const me = useProfile().data?.id
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const active = useMemo(() => usableWallets(wallets, me).filter((w) => !w.archived_at), [wallets, me])
  const { pay, undo } = useLoanInstallmentMutations()
  const [pickOpen, setPickOpen] = useState(false)
  const [pick, setPick] = useState("")
  const next = nextBankInstallment(debt)

  const saved = rememberedWallet(debt.id)
  const wallet = active.find((w) => w.id === saved)
  if (!next) return null
  const money = (n: number) => formatMoney(n, debt.currency)

  const run = async (target: Wallet) => {
    rememberWallet(debt.id, target.id)
    try {
      const paid = await pay.mutateAsync({ debtId: debt.id, walletId: target.id, exchangeRate: target.currency === debt.currency ? null : khrPerUsd })
      toast.success(t("bankLoan.paid", { n: paid.n, count: paid.count, total: money(paid.total) }), {
        description: t("bankLoan.split", { principal: money(paid.principal), interest: money(paid.interest), fee: money(paid.fee) }),
        duration: 8000,
        action: {
          label: t("recon.undo"),
          onClick: () =>
            undo.mutate(paid.id, {
              onSuccess: () => toast(t("bankLoan.undone")),
              onError: () => toast.error(t("common.error")),
            }),
        },
      })
    } catch (error) {
      const message = String((error as Error)?.message)
      toast.error(/already_paid|fully_paid/.test(message) ? t("bankLoan.allPaid") : t("common.error"))
    }
  }

  const openPicker = () => {
    setPick(wallet?.id ?? (active.find((w) => w.currency === debt.currency) ?? active[0])?.id ?? "")
    setPickOpen(true)
  }

  return (
    <div className="space-y-1">
      <Button className="h-12 w-full text-base" disabled={pay.isPending || active.length === 0} onClick={() => (wallet ? void run(wallet) : openPicker())}>
        {pay.isPending ? <Loader2Icon className="animate-spin" /> : <BanknoteIcon />}
        {t("bankLoan.pay", { n: next.n, amount: money(next.total) })}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t("bankLoan.split", { principal: money(next.principal), interest: money(next.interest), fee: money(next.fee) })}
        {wallet && (
          <>
            {" · "}
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={openPicker}>
              {t("bankLoan.from", { wallet: wallet.name })}
            </button>
          </>
        )}
      </p>

      <BottomSheet open={pickOpen} onOpenChange={setPickOpen} title={t("bankLoan.pay", { n: next.n, amount: money(next.total) })} description={t("bankLoan.chooseWallet")}>
        <div className="space-y-4">
          <WalletSelect wallets={active} value={pick} onChange={setPick} label={t("bankLoan.chooseWallet")} />
          <Button
            className="h-11 w-full"
            disabled={!pick || pay.isPending}
            onClick={() => {
              const target = active.find((w) => w.id === pick)
              if (!target) return
              setPickOpen(false)
              void run(target)
            }}
          >
            {t("bankLoan.confirm")}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
