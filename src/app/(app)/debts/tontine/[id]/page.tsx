"use client"

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  HandCoinsIcon,
  Loader2Icon,
  PencilIcon,
  PhoneIcon,
  Trash2Icon,
  TrophyIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { DueText, TontineStatusPill } from "@/components/tontine/tontine-list"
import { TontineFormSheet } from "@/components/tontine/tontine-form-sheet"
import { TontineRoundSheet } from "@/components/tontine/tontine-round-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { canWrite, useActiveWorkspace, useTontineMutations, useTontinePayments, useTontines, useWallets } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { roundStates, tontineProgress, type RoundState } from "@/lib/tontine"
import { cn } from "@/lib/utils"

const fmtDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  )
}

const STATE_ICON: Record<RoundState, React.ReactNode> = {
  paid: <CircleCheckIcon className="size-5 text-[#10B981]" aria-hidden />,
  won: <TrophyIcon className="size-5 text-amber-500" aria-hidden />,
  due: <CircleDashedIcon className="size-5 text-amber-600" aria-hidden />,
  overdue: <CircleDashedIcon className="size-5 text-[#F43F5E]" aria-hidden />,
  upcoming: <CircleIcon className="size-5 text-muted-foreground/50" aria-hidden />,
}

export default function TontineDetailPage() {
  const t = useT()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  const tontines = useTontines(workspace?.id)
  const payments = useTontinePayments(workspace?.id).data ?? []
  const wallets = useWallets(workspace?.id).data ?? []
  const mutations = useTontineMutations(workspace?.id)
  const [sheet, setSheet] = useState<{ mode: "pay" | "collect"; round: number | null } | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const tontine = tontines.data?.find((x) => x.id === id)
  if (tontines.isLoading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (!tontine) {
    return (
      <Card className="items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("tontine.notFound")}</p>
        <Button asChild variant="outline">
          <Link href="/debts?view=tontine">{t("common.back")}</Link>
        </Button>
      </Card>
    )
  }

  const p = tontineProgress(tontine, payments)
  const rounds = roundStates(tontine, payments)
  const money = (n: number) => formatMoney(n, tontine.currency)

  const undoPayment = (paymentId: string, round: number, linked: boolean) => {
    if (!window.confirm(t(linked ? "tontine.undoPaymentLinked" : "tontine.undoPayment", { round }))) return
    mutations.deletePayment.mutate(paymentId, { onError: () => toast.error(t("common.error")) })
  }
  const undoWin = () => {
    if (!window.confirm(t(tontine.won_transaction_id ? "tontine.undoWinLinked" : "tontine.undoWin"))) return
    mutations.undoWin.mutate(tontine.id, { onError: () => toast.error(t("common.error")) })
  }
  const remove = () => {
    if (!window.confirm(t("tontine.deleteConfirm", { name: tontine.name }))) return
    mutations.remove.mutate(tontine.id, {
      onSuccess: () => router.replace("/debts?view=tontine"),
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/debts?view=tontine">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{tontine.name}</h1>
        <TontineStatusPill dead={p.dead} complete={p.complete} className="text-xs" />
      </div>

      {/* Summary */}
      <Card className="gap-3 px-4 py-4">
        <div className="flex items-center gap-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("tontine.leader")}</p>
            <p className="truncate font-medium">{tontine.leader_name || "—"}</p>
          </div>
          {tontine.leader_phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${tontine.leader_phone.replace(/[^\d+]/g, "")}`}>
                <PhoneIcon />
                {tontine.leader_phone}
              </a>
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t(tontine.frequency === "WEEKLY" ? "tontine.sharePerWeek" : "tontine.sharePerMonth")} value={money(tontine.share_amount)} />
          <Stat label={t("tontine.progressLabel")} value={t("tontine.progress", { done: p.settled, total: tontine.total_rounds })} />
          <Stat label={t("tontine.totalPaid")} value={money(p.totalPaid)} tone="text-[#F43F5E]" />
          {p.dead ? (
            <Stat label={t("tontine.collected")} value={money(p.collected)} tone="text-[#10B981]" />
          ) : (
            <Stat label={t("tontine.savedByBids")} value={money(p.totalDiscount)} tone={p.totalDiscount > 0 ? "text-[#10B981]" : undefined} />
          )}
        </div>
        {p.dead && (
          <p className="text-xs text-muted-foreground">
            {t("tontine.wonInfo", { round: tontine.won_round!, date: tontine.won_on ? fmtDate(tontine.won_on) : "—" })}
            {tontine.won_bid ? ` · ${t("tontine.wonBid", { amount: money(tontine.won_bid) })}` : ""}
          </p>
        )}
      </Card>

      {/* Next round + quick actions */}
      {p.complete ? (
        <Card className="items-center gap-1 px-4 py-5 text-center">
          <CircleCheckIcon className="size-8 text-[#10B981]" aria-hidden />
          <p className="font-semibold">{t("tontine.completeTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("tontine.completeNet", { amount: formatMoney(p.net, tontine.currency, { signed: true }) })}</p>
        </Card>
      ) : (
        <Card className="gap-3 px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{t("tontine.nextRound", { round: p.nextRound!, total: tontine.total_rounds })}</p>
            <DueText p={p} className="text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">
            {fmtDate(p.nextDate!)} · {p.dead ? t("tontine.deadPays", { share: money(tontine.share_amount) }) : t("tontine.liveHint")}
          </p>
          {editable && (
            <div className={cn("grid gap-2", p.dead ? "grid-cols-1" : "grid-cols-2")}>
              <Button className="h-12" onClick={() => setSheet({ mode: "pay", round: p.nextRound })}>
                <HandCoinsIcon />
                {t("tontine.payButton")}
              </Button>
              {!p.dead && (
                <Button className="h-12" variant="outline" onClick={() => setSheet({ mode: "collect", round: p.nextRound })}>
                  <TrophyIcon className="text-amber-500" />
                  {t("tontine.collectButton")}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Round checklist */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("tontine.rounds")}</h2>
        <Card className="gap-0 divide-y py-0">
          {rounds.map(({ round, date, state, payment }) => {
            const clickable = editable && (state === "paid" || state === "won" || state === "overdue" || state === "due" || state === "upcoming")
            const onClick = () => {
              if (!editable) return
              if (state === "paid" && payment) undoPayment(payment.id, round, Boolean(payment.transaction_id))
              else if (state === "won") undoWin()
              else setSheet({ mode: "pay", round })
            }
            return (
              <button
                key={round}
                type="button"
                disabled={!clickable}
                onClick={onClick}
                className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", clickable && "hover:bg-muted/60", round === p.nextRound && "bg-primary/5")}
              >
                {STATE_ICON[state]}
                <span className="w-9 text-sm font-medium tabular-nums">#{round}</span>
                <span className="flex-1 text-xs text-muted-foreground tabular-nums">{fmtDate(state === "paid" && payment ? payment.paid_on : date)}</span>
                <span className="text-right text-sm tabular-nums">
                  {state === "paid" && payment ? (
                    <>
                      <span className="font-medium">{money(payment.amount)}</span>
                      {payment.discount > 0 && <span className="block text-[11px] text-[#10B981]">−{money(payment.discount)}</span>}
                    </>
                  ) : state === "won" ? (
                    <span className="font-semibold text-[#10B981]">+{money(tontine.won_amount ?? 0)}</span>
                  ) : (
                    <span className={cn("text-xs", state === "overdue" ? "text-[#F43F5E]" : "text-muted-foreground")}>{t(`tontine.state.${state}`)}</span>
                  )}
                </span>
              </button>
            )
          })}
        </Card>
        {editable && <p className="px-1 text-xs text-muted-foreground">{t("tontine.roundsHint")}</p>}
      </section>

      {editable && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <PencilIcon />
            {t("tontine.editShort")}
          </Button>
          <Button variant="outline" onClick={() => mutations.setClosed.mutate({ id: tontine.id, closed: !tontine.closed_at })}>
            {tontine.closed_at ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {t(tontine.closed_at ? "tontine.reopen" : "tontine.close")}
          </Button>
          <Button variant="outline" className="text-destructive" onClick={remove}>
            <Trash2Icon />
            {t("tontine.delete")}
          </Button>
        </div>
      )}

      {sheet && (
        <TontineRoundSheet
          open={Boolean(sheet)}
          onOpenChange={(v) => !v && setSheet(null)}
          mode={sheet.mode}
          round={sheet.round}
          tontine={tontine}
          payments={payments}
          wallets={wallets}
        />
      )}
      <TontineFormSheet open={editOpen} onOpenChange={setEditOpen} workspaceId={workspace?.id} tontine={tontine} />
    </div>
  )
}
