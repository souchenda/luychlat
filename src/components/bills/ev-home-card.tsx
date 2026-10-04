"use client"

import { format } from "date-fns"
import { Loader2Icon, PlusIcon, XIcon, ZapIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useEvLogs, useEvMutations } from "@/lib/bills"
import { useT } from "@/lib/i18n/use-t"

/**
 * /bills › EV home charging: a usage log (kWh), never a wallet expense — the
 * cost is already in the electricity bill. Logged here or from Telegram
 * ("សាកឡាននៅផ្ទះ 30kwh"). Public-station charging is a normal expense.
 */
export function EvHomeCard({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const t = useT()
  const logs = useEvLogs(workspaceId).data ?? []
  const { add, remove } = useEvMutations(workspaceId)
  const [kwh, setKwh] = useState("")
  const monthStart = format(new Date(), "yyyy-MM")
  const thisMonth = logs.filter((l) => format(new Date(l.charged_at), "yyyy-MM") === monthStart)
  const monthKwh = Math.round(thisMonth.reduce((s, l) => s + (l.kwh ?? 0), 0) * 100) / 100

  const submit = async () => {
    const value = kwh.trim() ? Number(kwh.replace(",", ".")) : null
    if (value !== null && !(value > 0 && value <= 500)) return void toast.error(t("ev.invalid"))
    try {
      await add.mutateAsync(value)
      setKwh("")
      toast.success(t("ev.logged"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <ZapIcon className="size-4" aria-hidden />
        {t("ev.title")}
      </h2>
      <Card className="gap-3 px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{t("ev.month", { count: thisMonth.length, kwh: monthKwh })}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t("ev.hint")}</p>
        {editable && (
          <div className="flex gap-2">
            <Input inputMode="decimal" placeholder={t("ev.kwhPlaceholder")} value={kwh} onChange={(e) => setKwh(e.target.value)} className="h-10 flex-1" aria-label="kWh" />
            <Button onClick={() => void submit()} disabled={add.isPending}>
              {add.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              {t("ev.log")}
            </Button>
          </div>
        )}
        {thisMonth.length > 0 && (
          <ul className="divide-y text-sm">
            {thisMonth.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-muted-foreground tabular-nums">{format(new Date(l.charged_at), "dd/MM HH:mm")}</span>
                <span className="font-medium tabular-nums">{l.kwh !== null ? `${l.kwh} kWh` : "—"}</span>
                {editable && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label={t("bills.delete")} onClick={() => void remove.mutateAsync(l.id)}>
                    <XIcon className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
