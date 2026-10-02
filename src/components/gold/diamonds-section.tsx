"use client"

import { format, parseISO } from "date-fns"
import { BadgeCheckIcon, GemIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { diamondSpec, diamondTotals, FORM_EMOJI, resaleValue, type Diamond } from "@/lib/diamonds"
import { useDiamonds } from "@/lib/diamonds-data"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

import { DiamondFormSheet } from "./diamond-form-sheet"

/** Diamonds in the jewelry tab: grading, certificate, and the liquid resale value (after the shop's buy-back deduction). */
export function DiamondsSection({ workspaceId, editable }: { workspaceId: string | undefined; editable: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const query = useDiamonds(workspaceId)
  const diamonds = useMemo(() => query.data ?? [], [query.data])
  const totals = diamondTotals(diamonds, khrPerUsd)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Diamond | null>(null)
  const edit = (d: Diamond | null) => {
    setEditing(d)
    setOpen(true)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1 pt-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <GemIcon className="size-4 text-sky-500" aria-hidden />
          {t("diamond.title")}
        </h2>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => edit(null)}>
            <PlusIcon />
            {t("diamond.add")}
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : diamonds.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{t("diamond.empty")}</p>
      ) : (
        <>
          <Card className="flex-row items-center justify-between gap-3 border-sky-500/30 bg-sky-500/5 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("diamond.liquidTotal")}</p>
              <p className="text-xl font-bold tabular-nums">{formatMoney(totals.liquidUsd, "USD", { hidden: hideBalances })}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{t("diamond.paidTotal", { amount: formatMoney(totals.paidUsd, "USD", { hidden: hideBalances }) })}</p>
              {totals.carats > 0 && <p>{totals.carats} ct</p>}
            </div>
          </Card>
          <ul className="space-y-2">
            {diamonds.map((d) => {
              const r = resaleValue(d)
              const money = (n: number) => formatMoney(n, d.currency, { hidden: hideBalances })
              const spec = diamondSpec(d, locale)
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => editable && edit(d)} disabled={!editable} className="block w-full text-left">
                    <Card className="gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-xl" aria-hidden>
                          {FORM_EMOJI[d.form]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(`diamond.form.${d.form}` as MessageKey)}
                            {spec && ` · ${spec}`}
                          </p>
                          {d.cert_type !== "NONE" && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-400">
                              <BadgeCheckIcon className="size-3.5" aria-hidden />
                              {t(`diamond.cert.${d.cert_type}` as MessageKey)}
                              {d.cert_number && <span className="font-mono">#{d.cert_number}</span>}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">{money(r.liquid)}</span>
                          <span className="block text-[11px] text-muted-foreground">{t("diamond.liquidShort")}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                        <span>
                          {t("gold.boughtFor", { amount: money(d.purchase_price) })}
                          {d.purchase_date ? ` · ${format(parseISO(d.purchase_date), "dd/MM/yyyy")}` : ""}
                        </span>
                        <span className="text-rose-600 dark:text-rose-400">
                          −{money(r.deduction)} ({d.buyback_pct}%)
                        </span>
                      </div>
                    </Card>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">{t("diamond.note")}</p>
      <DiamondFormSheet open={open} onOpenChange={setOpen} workspaceId={workspaceId} diamond={editing} />
    </section>
  )
}
