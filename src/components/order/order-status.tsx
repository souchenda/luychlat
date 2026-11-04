"use client"

import { CheckIcon, Loader2Icon } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"

import { formatMoney } from "@/lib/money"
import { ORDER_STATE_LABEL, ORDER_STEPS, type OrderState } from "@/lib/order-ahead"
import { cn } from "@/lib/utils"

type Line = { name: string; price: number; qty: number; choices: Record<string, string> }
type Status = {
  status: "ok" | "gone" | "error"
  order?: { code: string; items: Line[]; total: number | string; currency: "USD" | "KHR"; pickup_at: string; state: OrderState; customer_name: string }
  shop?: { name: string; slug: string }
  khqr?: string | null
}

const hhmm = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)

/**
 * The customer's order (founder, 4/11/2026 — docs/order-ahead.md): its counter code, what was ordered, the shop's KHQR with
 * this order's amount while it is unpaid, and the steps to «ready», refreshed every 10 seconds. Phase 1: the shop confirms
 * the payment it received (the slip upload and the automatic match come in phase 2).
 */
export function OrderStatus({ token }: { token: string }) {
  const [s, setS] = useState<Status | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    const load = () =>
      fetch(`/api/order/status/${token}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((x: Status) => !stop && setS(x))
        .catch(() => null)
    void load()
    const every = window.setInterval(load, 10_000)
    return () => {
      stop = true
      window.clearInterval(every)
    }
  }, [token])

  useEffect(() => {
    if (s?.khqr) void QRCode.toDataURL(s.khqr, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then(setQr)
    else setQr(null)
  }, [s?.khqr])

  if (!s) return <Centered><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></Centered>
  if (s.status !== "ok" || !s.order) return <Centered><p className="text-center text-sm text-muted-foreground">រកការកម្មង់នេះមិនឃើញទេ · Order not found</p></Centered>

  const o = s.order
  const step = ORDER_STEPS.indexOf(o.state)
  return (
    <div className="mx-auto min-h-dvh max-w-md space-y-4 bg-background px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <header className="text-center">
        <p className="text-sm text-muted-foreground">{s.shop?.name}</p>
        <p className="text-4xl font-extrabold tracking-wide tabular-nums">{o.code}</p>
        <p className="text-sm text-muted-foreground">មកយកម៉ោង · Pickup {hhmm(o.pickup_at)}</p>
      </header>

      {o.state === "PENDING_PAYMENT" && (
        <section className="space-y-2 rounded-3xl border bg-card px-4 py-4 text-center">
          <p className="text-sm font-semibold">ស្កេនដើម្បីបង់ · Scan to pay</p>
          <p className="text-3xl font-extrabold tabular-nums">{formatMoney(Number(o.total), o.currency)}</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn here
            <img src={qr} alt="KHQR" className="mx-auto aspect-square w-64 rounded-2xl bg-white p-2" />
          ) : (
            <p className="text-sm text-muted-foreground">ហាងមិនទាន់មាន KHQR សម្រាប់រូបិយប័ណ្ណនេះទេ — សូមបង់នៅហាង · Please pay at the shop</p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">បង់ហើយ ហាងនឹងបញ្ជាក់ ហើយទំព័រនេះប្តូរដោយខ្លួនឯង · Once paid, the shop confirms and this page updates by itself</p>
        </section>
      )}

      {o.state === "CANCELLED" ? (
        <p className="rounded-2xl bg-muted px-4 py-3 text-center text-sm">{ORDER_STATE_LABEL.CANCELLED}</p>
      ) : (
        <ol className="space-y-2 rounded-3xl border bg-card px-4 py-4">
          {ORDER_STEPS.map((st, i) => (
            <li key={st} className="flex items-center gap-3">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/15 text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground")}>
                {i < step ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className={cn("text-sm", i === step ? "font-semibold" : i > step && "text-muted-foreground")}>{ORDER_STATE_LABEL[st]}</span>
            </li>
          ))}
        </ol>
      )}

      <ul className="divide-y rounded-3xl border bg-card">
        {o.items.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{l.qty} × {l.name}</span>
              {Object.values(l.choices ?? {}).length > 0 && <span className="block text-xs text-muted-foreground">{Object.values(l.choices).join(" · ")}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(Number(l.price) * l.qty, o.currency)}</span>
          </li>
        ))}
        <li className="flex justify-between px-4 py-3 font-bold">
          <span>សរុប · Total</span>
          <span className="tabular-nums">{formatMoney(Number(o.total), o.currency)}</span>
        </li>
      </ul>
      <p className="text-center text-xs text-muted-foreground">រក្សាទំព័រនេះទុក ដើម្បីមើលស្ថានភាព · Keep this page to follow your order</p>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-6">{children}</div>
}
