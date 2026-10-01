"use client"

import { Loader2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usableWallets, useProfile, useTontineMutations, useWallets } from "@/lib/data/hooks"
import type { Currency, Tontine, TontineFrequency, TontineInput } from "@/lib/data/types"
import { toDateInput } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"

const NONE = "__none"

/** Create or edit one hand (ជើង) of a tontine. */
export function TontineFormSheet({
  open,
  onOpenChange,
  workspaceId,
  tontine,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  tontine?: Tontine
  onCreated?: (t: Tontine) => void
}) {
  const t = useT()
  const { create, update } = useTontineMutations(workspaceId)
  const me = useProfile().data?.id
  const wallets = useWallets(workspaceId).data
  const active = useMemo(() => usableWallets(wallets ?? [], me).filter((w) => !w.archived_at), [wallets, me])

  const [name, setName] = useState("")
  const [leaderName, setLeaderName] = useState("")
  const [leaderPhone, setLeaderPhone] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [share, setShare] = useState("")
  const [frequency, setFrequency] = useState<TontineFrequency>("MONTHLY")
  const [rounds, setRounds] = useState("10")
  const [startDate, setStartDate] = useState(toDateInput(new Date().toISOString()))
  const [walletId, setWalletId] = useState(NONE)
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open) return
    setName(tontine?.name ?? "")
    setLeaderName(tontine?.leader_name ?? "")
    setLeaderPhone(tontine?.leader_phone ?? "")
    setCurrency(tontine?.currency ?? "USD")
    setShare(tontine ? String(tontine.share_amount) : "")
    setFrequency(tontine?.frequency ?? "MONTHLY")
    setRounds(String(tontine?.total_rounds ?? 10))
    setStartDate(tontine?.start_date ?? toDateInput(new Date().toISOString()))
    setWalletId(tontine?.wallet_id ?? NONE)
    setNote(tontine?.note ?? "")
  }, [open, tontine])

  const shareValue = roundMoney(parseAmount(share), currency)
  const roundsValue = Number(rounds)
  const valid = name.trim().length > 0 && shareValue > 0 && Number.isInteger(roundsValue) && roundsValue >= 2 && roundsValue <= 100 && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
  const busy = create.isPending || update.isPending
  // The pot when everyone pays the full share (a rough ceiling; bids lower it).
  const fullPot = shareValue > 0 && roundsValue >= 2 ? shareValue * (roundsValue - 1) : 0

  const save = async () => {
    if (!valid) return
    const input: TontineInput = {
      name: name.trim(),
      leader_name: leaderName.trim() || null,
      leader_phone: leaderPhone.trim() || null,
      currency,
      share_amount: shareValue,
      frequency,
      total_rounds: roundsValue,
      start_date: startDate,
      wallet_id: walletId === NONE ? null : walletId,
      note: note.trim() || null,
    }
    try {
      if (tontine) await update.mutateAsync({ id: tontine.id, input })
      else onCreated?.(await create.mutateAsync(input))
      toast.success(t("tontine.saved"))
      onOpenChange(false)
    } catch (error) {
      toast.error(/round_out_of_range/.test(String((error as Error).message)) ? t("tontine.roundsTooFew") : t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(tontine ? "tontine.edit" : "tontine.add")} description={t("tontine.formHint")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="tt-name">{t("tontine.name")}</Label>
          <Input id="tt-name" className="h-11" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tontine.namePlaceholder")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="tt-leader">{t("tontine.leader")}</Label>
            <Input id="tt-leader" className="h-11" maxLength={60} value={leaderName} onChange={(e) => setLeaderName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tt-phone">{t("tontine.leaderPhone")}</Label>
            <Input id="tt-phone" className="h-11" inputMode="tel" maxLength={30} value={leaderPhone} onChange={(e) => setLeaderPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tt-share">{t("tontine.share")}</Label>
          <div className="flex gap-2">
            <Input
              id="tt-share"
              className="h-11 flex-1 text-lg font-semibold tabular-nums"
              inputMode="decimal"
              value={share}
              onChange={(e) => setShare(e.target.value)}
              placeholder={currency === "USD" ? "50" : "100,000"}
            />
            <div className="w-28">
              <Segmented
                aria-label={t("walletForm.currency")}
                value={currency}
                onChange={setCurrency}
                disabled={Boolean(tontine)}
                options={[
                  { value: "USD", label: "$" },
                  { value: "KHR", label: "៛" },
                ]}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("tontine.shareHint")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("tontine.frequency")}</Label>
            <Segmented
              aria-label={t("tontine.frequency")}
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "WEEKLY", label: t("tontine.weekly") },
                { value: "MONTHLY", label: t("tontine.monthly") },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tt-rounds">{t("tontine.rounds")}</Label>
            <Input id="tt-rounds" className="h-9" inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        {fullPot > 0 && <p className="-mt-2 text-xs text-muted-foreground">{t("tontine.potHint", { amount: formatMoney(fullPot, currency) })}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="tt-start">{t("tontine.startDate")}</Label>
            <Input id="tt-start" type="date" className="h-11" max="9999-12-31" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("tontine.wallet")}</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("tontine.noWallet")}</SelectItem>
                {active.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {w.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tt-note">{t("entry.note")}</Label>
          <Input id="tt-note" className="h-11" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={!valid || busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </form>
    </BottomSheet>
  )
}
