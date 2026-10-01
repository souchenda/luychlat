"use client"

import { HandCoinsIcon, Loader2Icon, TrophyIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usableWallets, useProfile, useTontineMutations } from "@/lib/data/hooks"
import { amountInWalletCurrency } from "@/lib/data/ledger"
import type { Tontine, TontinePayment, Wallet } from "@/lib/data/types"
import { toDateInput } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { roundDate } from "@/lib/tontine"
import { usePrefsStore } from "@/stores/prefs-store"

const NONE = "__none"
const fmtDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

/**
 * "pay": បង់លុយក្បាលនេះ — one round's share (live members usually pay less: the
 * share minus that round's bid). "collect": ដេញបាន — the pot comes in and the
 * user becomes a dead member (កូនងាប់).
 */
export function TontineRoundSheet({
  open,
  onOpenChange,
  mode,
  tontine,
  payments,
  wallets,
  round: initialRound,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "pay" | "collect"
  tontine: Tontine
  payments: TontinePayment[]
  wallets: Wallet[]
  round: number | null
}) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { pay, collect } = useTontineMutations(tontine.workspace_id)
  const me = useProfile().data?.id
  const active = useMemo(() => usableWallets(wallets, me).filter((w) => !w.archived_at), [wallets, me])
  const paid = useMemo(() => new Set(payments.filter((p) => p.tontine_id === tontine.id).map((p) => p.round_no)), [payments, tontine.id])
  const open_rounds = useMemo(
    () => Array.from({ length: tontine.total_rounds }, (_, i) => i + 1).filter((r) => !paid.has(r) && r !== tontine.won_round),
    [tontine.total_rounds, tontine.won_round, paid],
  )
  const dead = tontine.won_round !== null

  const [round, setRound] = useState(1)
  const [amountText, setAmountText] = useState("")
  const [bidText, setBidText] = useState("")
  const [walletId, setWalletId] = useState(NONE)
  const [date, setDate] = useState(toDateInput(new Date().toISOString()))
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open) return
    setRound(initialRound ?? open_rounds[0] ?? 1)
    setAmountText(mode === "pay" ? String(tontine.share_amount) : "")
    setBidText("")
    const preferred = active.find((w) => w.id === tontine.wallet_id) ?? active.find((w) => w.currency === tontine.currency) ?? active[0]
    setWalletId(preferred?.id ?? NONE)
    setDate(toDateInput(new Date().toISOString()))
    setNote("")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open])

  const amount = roundMoney(parseAmount(amountText), tontine.currency)
  const bid = roundMoney(parseAmount(bidText), tontine.currency)
  const discount = mode === "pay" ? Math.max(0, roundMoney(tontine.share_amount - amount, tontine.currency)) : 0
  const wallet = active.find((w) => w.id === walletId)
  const converted =
    wallet && wallet.currency !== tontine.currency && amount > 0
      ? amountInWalletCurrency(amount, tontine.currency, khrPerUsd, wallet.currency)
      : null
  const busy = pay.isPending || collect.isPending
  const valid = amount > 0 && open_rounds.includes(round) && /^\d{4}-\d{2}-\d{2}$/.test(date)

  const save = async () => {
    if (!valid) return
    const common = {
      tontine_id: tontine.id,
      round_no: round,
      amount,
      wallet_id: wallet?.id ?? null,
      exchange_rate: wallet && wallet.currency !== tontine.currency ? khrPerUsd : null,
      note: note.trim() || null,
    }
    try {
      if (mode === "pay") {
        await pay.mutateAsync({ ...common, discount, paid_on: date })
        toast.success(t("tontine.paidToast", { round }))
      } else {
        await collect.mutateAsync({ ...common, bid: bid > 0 ? bid : null, received_on: date })
        toast.success(t("tontine.wonToast"))
      }
      onOpenChange(false)
    } catch (error) {
      const message = String((error as Error).message)
      toast.error(
        /round_paid|round_is_won/.test(message) ? t("tontine.roundTaken") : /already_won/.test(message) ? t("tontine.alreadyWon") : t("common.error"),
      )
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(mode === "pay" ? "tontine.payTitle" : "tontine.collectTitle")}
      description={`${tontine.name} · ${t(dead ? "tontine.dead" : "tontine.live")}`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="space-y-2">
          <Label>{t("tontine.round")}</Label>
          <Select value={String(round)} onValueChange={(v) => setRound(Number(v))}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {open_rounds.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {t("tontine.roundOf", { round: r, total: tontine.total_rounds })} · {fmtDate(roundDate(tontine, r))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tt-amount">{t(mode === "pay" ? "tontine.payAmount" : "tontine.potAmount", { currency: tontine.currency })}</Label>
          <Input
            id="tt-amount"
            className="h-14 text-2xl font-semibold tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder={mode === "collect" ? String(roundMoney(tontine.share_amount * (tontine.total_rounds - 1), tontine.currency)) : undefined}
          />
          {mode === "pay" ? (
            <p className="text-xs text-muted-foreground">
              {dead
                ? t("tontine.deadPays", { share: formatMoney(tontine.share_amount, tontine.currency) })
                : discount > 0
                  ? t("tontine.liveSaved", { amount: formatMoney(discount, tontine.currency) })
                  : t("tontine.liveHint")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("tontine.potHelp")}</p>
          )}
        </div>

        {mode === "collect" && (
          <div className="space-y-2">
            <Label htmlFor="tt-bid">{t("tontine.bid")}</Label>
            <Input id="tt-bid" className="h-11 tabular-nums" inputMode="decimal" value={bidText} onChange={(e) => setBidText(e.target.value)} placeholder="0" />
          </div>
        )}

        <div className="space-y-2">
          <Label>{t(mode === "pay" ? "tontine.payFrom" : "tontine.receiveInto")}</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {active.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} · {formatMoney(w.balance, w.currency)}
                </SelectItem>
              ))}
              <SelectItem value={NONE}>{t("tontine.recordOnly")}</SelectItem>
            </SelectContent>
          </Select>
          {converted !== null && wallet && (
            <p className="text-xs text-muted-foreground">
              {t("entry.converted", { amount: formatMoney(converted, wallet.currency), rate: khrPerUsd.toLocaleString("en-US") })}
            </p>
          )}
          {!wallet && <p className="text-xs text-muted-foreground">{t("tontine.recordOnlyHint")}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="tt-date">{t("entry.date")}</Label>
            <Input id="tt-date" type="date" className="h-11" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tt-round-note">{t("entry.note")}</Label>
            <Input id="tt-round-note" className="h-11" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={!valid || busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : mode === "pay" ? <HandCoinsIcon /> : <TrophyIcon />}
          {t(mode === "pay" ? "tontine.payButton" : "tontine.collectButton")}
        </Button>
      </form>
    </BottomSheet>
  )
}
