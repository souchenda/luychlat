"use client"

import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowLeftIcon, CrownIcon, DownloadIcon, ExternalLinkIcon, FlaskConicalIcon, Loader2Icon, PartyPopperIcon, RefreshCwIcon, TimerIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { encode } from "uqr"

import { Button } from "@/components/ui/button"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { usePlan, useRefreshPlan } from "@/lib/plan"
import { cn } from "@/lib/utils"

export type KhqrView = {
  id: string
  status: "PENDING" | "PAID" | "EXPIRED" | "REJECTED"
  qr: string | null
  amount: number
  currency: "USD" | "KHR"
  plan_code: string
  bill_number: string | null
  expires_at: string | null
  sandbox: boolean
  merchant_name: string
  deeplink: string | null
  period_end: string | null
}

const POLL_MS = 4000
const KHQR_RED = "#E1232E"

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `http_${res.status}`)
  return body as T
}

/** QR modules as one SVG path (crisp at any size). */
function QrSvg({ value, className }: { value: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(value, { ecc: "M", border: 0 })
    let d = ""
    data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)))
    return { path: d, size }
  }, [value])
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} shapeRendering="crispEdges" role="img" aria-label="KHQR">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

/** PNG of the QR + amount, for "scan from gallery" in a bank app. */
async function qrPng(view: KhqrView): Promise<Blob | null> {
  if (!view.qr) return null
  const { data, size } = encode(view.qr, { ecc: "M", border: 0 })
  const scale = 10
  const pad = 40
  const width = size * scale + pad * 2
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = width + 110
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = KHQR_RED
  ctx.fillRect(0, 0, canvas.width, 70)
  ctx.fillStyle = "#fff"
  ctx.font = "bold 34px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("KHQR", canvas.width / 2, 47)
  ctx.fillStyle = "#000"
  data.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(pad + x * scale, 90 + y * scale, scale, scale)))
  ctx.font = "bold 30px sans-serif"
  ctx.fillText(`${formatMoney(view.amount, view.currency)} · ${view.merchant_name}`, canvas.width / 2, width + 85)
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/**
 * Dynamic KHQR checkout: creates the QR, counts down, polls the server (which
 * asks Bakong) and celebrates the moment PRO is active.
 */
export function KhqrCheckout({
  planCode,
  currency,
  onBack,
  onDone,
}: {
  planCode: string
  currency: "USD" | "KHR"
  onBack: () => void
  onDone: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const refreshPlan = useRefreshPlan()
  const { plan } = usePlan()
  const [view, setView] = useState<KhqrView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"create" | "check" | "simulate" | null>("create")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pending = view?.status === "PENDING"
  const now = useNow(pending)
  const secondsLeft = view?.expires_at ? Math.max(0, Math.round((Date.parse(view.expires_at) - now) / 1000)) : 0

  // The countdown re-renders every second: keep the callbacks stable so the
  // poll timer isn't restarted (and the QR isn't recreated) on each tick.
  const latest = useRef({ refreshPlan, queryClient, t })
  latest.current = { refreshPlan, queryClient, t }
  const viewId = view?.id

  const apply = useCallback((next: KhqrView) => {
    setView(next)
    if (next.status === "PAID") {
      void latest.current.refreshPlan()
      void latest.current.queryClient.invalidateQueries({ queryKey: ["payments-mine"] })
    }
  }, [])

  const create = useCallback(async () => {
    setBusy("create")
    setError(null)
    try {
      apply(await api<KhqrView>("/api/billing/khqr", { method: "POST", body: JSON.stringify({ plan_code: planCode, currency }) }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [apply, planCode, currency])

  const check = useCallback(
    async (manual = false) => {
      if (!viewId) return
      if (manual) setBusy("check")
      try {
        apply(await api<KhqrView>(`/api/billing/khqr/${viewId}`))
      } catch {
        if (manual) toast.error(latest.current.t("common.error"))
      } finally {
        if (manual) setBusy(null)
      }
    },
    [viewId, apply],
  )

  // One QR per opening of the checkout (React dev mode mounts effects twice).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void create()
  }, [create])

  // Poll while the QR is live (and right away when the app comes back to the front).
  useEffect(() => {
    if (!pending) return
    pollRef.current = setInterval(() => document.visibilityState === "visible" && void check(), POLL_MS)
    const onVisible = () => document.visibilityState === "visible" && void check()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [pending, check])

  // At zero, ask once more (a last-second payment wins over expiry).
  useEffect(() => {
    if (pending && secondsLeft === 0) void check()
  }, [pending, secondsLeft, check])

  const simulate = async () => {
    if (!view) return
    setBusy("simulate")
    try {
      apply(await api<KhqrView>(`/api/billing/khqr/${view.id}/simulate`, { method: "POST", body: "{}" }))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const saveImage = async () => {
    if (!view) return
    const blob = await qrPng(view)
    if (!blob) return
    const file = new File([blob], `luysmart-khqr-${view.bill_number ?? "pay"}.png`, { type: "image/png" })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "KHQR" })
        return
      } catch {
        // cancelled: fall back to download
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // --- paid ---------------------------------------------------------------------
  if (view?.status === "PAID") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center animate-in fade-in-0 zoom-in-95 duration-300">
        <span className="flex size-20 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <PartyPopperIcon className="size-10" aria-hidden />
        </span>
        <p className="text-xl font-bold">{t("khqr.paidTitle")}</p>
        <p className="text-sm text-muted-foreground">
          {view.period_end ? t("khqr.paidUntil", { date: format(new Date(view.period_end), "dd/MM/yyyy") }) : t("khqr.paidShort")}
        </p>
        {view.sandbox && <p className="text-xs text-amber-600">{t("khqr.sandboxPaid")}</p>}
        <Button className="mt-2 h-12 w-full text-base" onClick={onDone}>
          <CrownIcon />
          {t("khqr.start")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("khqr.otherWays")}
      </button>

      {error ? (
        <div className="space-y-3 rounded-xl bg-destructive/10 p-4 text-center text-sm text-destructive">
          <p>{t(`khqr.error.${["too_many_qr", "not_signed_in", "khqr_unavailable"].includes(error) ? error : "generic"}` as MessageKey)}</p>
          <Button size="sm" variant="outline" onClick={() => void create()}>
            <RefreshCwIcon />
            {t("khqr.tryAgain")}
          </Button>
        </div>
      ) : !view || busy === "create" ? (
        <div className="flex h-96 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-6 animate-spin" aria-hidden />
          {t("khqr.creating")}
        </div>
      ) : (
        <>
          {view.sandbox && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <FlaskConicalIcon className="size-4 shrink-0" aria-hidden />
              {t("khqr.sandboxBanner")}
            </p>
          )}

          {/* KHQR card */}
          <div className="mx-auto w-full max-w-72 overflow-hidden rounded-2xl border bg-white text-black shadow-md">
            <div className="flex h-11 items-center justify-center text-lg font-extrabold tracking-wider text-white" style={{ background: KHQR_RED }}>
              KHQR
            </div>
            <div className="px-5 pt-3">
              <p className="truncate text-sm text-neutral-600">{view.merchant_name}</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatMoney(view.amount, view.currency)}
              </p>
            </div>
            <div className="mx-5 my-3 border-t border-dashed border-neutral-300" />
            <div className={cn("relative px-6 pb-5", !pending && "opacity-20")}>
              {view.qr && <QrSvg value={view.qr} className="mx-auto aspect-square w-full" />}
            </div>
            {!pending && (
              <p className="-mt-2 pb-4 text-center text-sm font-semibold text-neutral-700">{t("khqr.expired")}</p>
            )}
          </div>

          {pending ? (
            <>
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className={cn("flex items-center gap-1.5 tabular-nums", secondsLeft < 60 ? "text-[#F43F5E]" : "text-muted-foreground")}>
                  <TimerIcon className="size-4" aria-hidden />
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  {t("khqr.waiting")}
                </span>
              </div>
              <p className="text-center text-xs text-muted-foreground">{t("khqr.scanHint")}</p>
              <div className={cn("grid gap-2", view.deeplink ? "grid-cols-2" : "grid-cols-1")}>
                {view.deeplink && (
                  <Button asChild className="h-11">
                    <a href={view.deeplink} rel="noopener noreferrer">
                      <ExternalLinkIcon />
                      {t("khqr.openBank")}
                    </a>
                  </Button>
                )}
                <Button variant="outline" className="h-11" onClick={() => void saveImage()}>
                  <DownloadIcon />
                  {t("khqr.saveImage")}
                </Button>
              </div>
              {view.sandbox && plan.is_admin && (
                <Button variant="secondary" className="w-full" onClick={() => void simulate()} disabled={busy === "simulate"}>
                  {busy === "simulate" ? <Loader2Icon className="animate-spin" /> : <FlaskConicalIcon />}
                  {t("khqr.simulate")}
                </Button>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void check(true)} disabled={busy === "check"}>
                {busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                {t("khqr.alreadyPaid")}
              </Button>
              <Button onClick={() => void create()}>
                <RefreshCwIcon />
                {t("khqr.newQr")}
              </Button>
            </div>
          )}
          {view.bill_number && <p className="text-center font-mono text-[11px] text-muted-foreground">#{view.bill_number}</p>}
        </>
      )}
    </div>
  )
}
