"use client"

import { DownloadIcon, Loader2Icon, QrCodeIcon, Share2Icon } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { khmerDigits } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { roundMoney } from "@/lib/money"
import type { PoolSnapshot } from "@/lib/pool"
import { CLOSING_BLESSING } from "@/lib/pool-blessing"
import { usePendingPoolPayments, usePoolMutations } from "@/lib/pools"
import { useMoney } from "@/lib/use-money"
import { useLocaleStore } from "@/stores/locale-store"

function useNum() {
  const locale = useLocaleStore((s) => s.locale)
  return (n: number) => (locale === "km" ? khmerDigits(String(n)) : String(n))
}

/** "📊 ៥/១០ គ្រួសារបានចូលរួចរាល់ ($500 / $1,000)" with a bar — for pools with set shares. */
export function PoolProgress({ pool }: { pool: PoolSnapshot }) {
  const t = useT()
  const money = useMoney()
  const num = useNum()
  const shares = pool.members.filter((m) => m.pledged > 0)
  if (!shares.length) return null
  const done = shares.filter((m) => m.paid >= m.pledged).length
  const target = roundMoney(shares.reduce((s, m) => s + m.pledged, 0), pool.currency)
  const paid = roundMoney(shares.reduce((s, m) => s + Math.min(m.paid, m.pledged), 0), pool.currency)
  const pct = target > 0 ? Math.min(100, Math.round((paid / target) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium tabular-nums">
        {t(pool.unit === "FAMILY" ? "pool.progressFamilies" : "pool.progressPeople", { done: num(done), total: num(shares.length) })}{" "}
        <span className="text-muted-foreground">
          ({money(paid, pool.currency)} / {money(target, pool.currency)})
        </span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Bank payments waiting for "whose share?" — one tap on a share records it (same as the group's buttons). */
export function PendingPayments({ pool, editable }: { pool: PoolSnapshot; editable: boolean }) {
  const t = useT()
  const money = useMoney()
  const pending = usePendingPoolPayments(pool.id, editable && pool.status === "active").data ?? []
  const { assignPayment } = usePoolMutations()
  const [busy, setBusy] = useState<string | null>(null)
  if (!editable || pool.status !== "active" || !pending.length) return null
  const unpaid = pool.members.filter((m) => m.pledged > 0 && m.paid < m.pledged)
  const choices = unpaid.length ? unpaid : pool.members

  const assign = (pendingId: string, memberId: string) => {
    setBusy(pendingId)
    assignPayment.mutate(
      { pendingId, memberId },
      {
        onSuccess: (r) => (r.status === "ok" ? toast.success(t("pool.assigned", { name: r.member ?? "" })) : toast.info(t("pool.assignDone"))),
        onError: () => toast.error(t("common.error")),
        onSettled: () => setBusy(null),
      },
    )
  }

  return (
    <Card className="gap-3 border-amber-500/40 px-4 py-4">
      <p className="text-sm font-semibold">{t("pool.pendingTitle")}</p>
      {pending.map((p) => (
        <div key={p.id} className="space-y-2 rounded-xl bg-muted/50 p-3">
          <p className="text-sm">
            💵 <span className="font-semibold tabular-nums">{money(p.amount, p.currency)}</span>
            {p.payer ? ` · ${p.payer}` : ""}
            <span className="ml-1 text-xs text-muted-foreground">({p.source === "khqr" ? "KHQR" : t("pool.fromSlip")})</span>
          </p>
          <p className="text-xs text-muted-foreground">{t("pool.whoseShare")}</p>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((m) => (
              <Button key={m.id} size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={() => assign(p.id, m.id!)}>
                {busy === p.id ? <Loader2Icon className="animate-spin" /> : null}
                {m.name}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}

/** The pool's KHQR (the keeper's), to scan and pay in. */
export function PoolKhqr({ pool }: { pool: PoolSnapshot }) {
  const t = useT()
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (pool.khqr) {
      QRCode.toDataURL(pool.khqr, { width: 480, margin: 2, errorCorrectionLevel: "M" })
        .then((url) => live && setSrc(url))
        .catch(() => live && setSrc(null))
    }
    return () => {
      live = false
    }
  }, [pool.khqr])
  if (!pool.khqr || pool.status !== "active" || !src) return null
  return (
    <Card className="items-center gap-2 px-4 py-4 text-center">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <QrCodeIcon className="size-4 text-primary" aria-hidden />
        {t("pool.khqrTitle")}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
      <img src={src} alt={t("pool.khqrTitle")} className="size-52 rounded-xl bg-white p-2" />
      <p className="text-xs text-muted-foreground">{t("pool.khqrHint", { keeper: pool.keeper || t("pool.keeperDefault") })}</p>
    </Card>
  )
}

/** A closed family / festival pool: the blessing, and the summary card to save or share. */
export function ClosingBlessing({ pool }: { pool: PoolSnapshot }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const url = `/api/pools/${pool.id}/card`
  const share = async () => {
    setBusy(true)
    try {
      const blob = await (await fetch(url, { cache: "no-store" })).blob()
      const file = new File([blob], "luychlat-pool.png", { type: "image/png" })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: pool.title, text: CLOSING_BLESSING })
      else {
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = "luychlat-pool.png"
        a.click()
        URL.revokeObjectURL(a.href)
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="gap-3 border-amber-400/50 bg-amber-50/40 px-4 py-4 dark:bg-amber-950/10">
      <p className="text-sm font-semibold">{t("pool.blessingTitle")}</p>
      <p className="text-sm leading-relaxed whitespace-pre-line">{CLOSING_BLESSING}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-10" asChild>
          <a href={url} download="luychlat-pool.png">
            <DownloadIcon />
            {t("pool.cardDownload")}
          </a>
        </Button>
        <Button className="h-10" onClick={() => void share()} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <Share2Icon />}
          {t("pool.cardShare")}
        </Button>
      </div>
    </Card>
  )
}
