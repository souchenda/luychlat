"use client"

import { CameraIcon, Loader2Icon, LockIcon, ShieldCheckIcon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebts } from "@/lib/data/hooks"
import { dayDate, khmerDigits } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { compressImage, MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import { gaugeFraction, guardianLenders, KSCORE_MAX, KSCORE_MIN, KSCORE_TIERS, kscoreTier, kscoreTrend, type KScoreRead, type KScoreTier } from "@/lib/kscore"
import { useLatestKScore, useSaveKScore } from "@/lib/kscore-data"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const TIERS: KScoreTier[] = ["high", "moderate", "good", "excellent"]

const CX = 100
const CY = 96
const R = 80
/** The point on the half circle for a 100–1400 score (left = 100, right = 1400). */
const at = (score: number) => {
  const a = Math.PI * (1 - gaugeFraction(score))
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) }
}
const arc = (from: number, to: number) => {
  const a = at(from)
  const b = at(to)
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

/**
 * CBC's gauge: the track is CBC's four bands (100–550 red · 551–750 orange · 751–950 lime ·
 * 951–1400 emerald, the founder's reference); the score's own band is bold, and a glowing
 * indicator in its colour marks the score (1044: emerald, in the top-right green zone).
 */
function Gauge({ score }: { score: number }) {
  const key = kscoreTier(score)
  const tier = KSCORE_TIERS[key]
  const dot = at(score)
  return (
    <svg viewBox="0 0 200 104" className="h-auto w-full max-w-[17rem]" aria-hidden>
      <defs>
        <filter id="ks-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={tier.color} floodOpacity="0.7" />
        </filter>
      </defs>
      {/* The soft track under the bands. */}
      <path d={arc(KSCORE_MIN, KSCORE_MAX)} fill="none" className="stroke-[#E2E8F0] dark:stroke-white/10" strokeWidth={14} strokeLinecap="round" />
      {TIERS.map((k) => {
        const t = KSCORE_TIERS[k]
        const mine = k === key
        return (
          <path
            key={k}
            d={arc(t.min + (k === "high" ? 0 : 6), t.max - (k === "excellent" ? 0 : 6))}
            fill="none"
            stroke={t.color}
            strokeWidth={mine ? 12 : 8}
            // Square joins between the bands (round caps overlapped into dark dots).
            strokeLinecap="butt"
            opacity={mine ? 1 : 0.55}
            filter={mine ? "url(#ks-glow)" : undefined}
          />
        )
      })}
      {/* The score's indicator. */}
      <circle cx={dot.x} cy={dot.y} r={9} fill="#ffffff" filter="url(#ks-glow)" />
      <circle cx={dot.x} cy={dot.y} r={5.5} fill={tier.color} />
    </svg>
  )
}

/**
 * «CBC Credit Health»: the person's own K-Score (never in a workspace, never in the bot) — the gauge,
 * CBC's words for the level, the score date and the trend, a K-Score Guardian tip naming their open
 * loans, and «📷» to add a newer CBC screenshot (read, then confirmed before saving).
 */
export function CreditHealthCard({ workspaceId }: { workspaceId?: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const latest = useLatestKScore()
  const lenders = guardianLenders(useDebts(workspaceId).data ?? [])
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [draft, setDraft] = useState<KScoreRead | null>(null)
  const k = latest.data
  const tierKey = k ? kscoreTier(k.score) : null
  const tier = tierKey ? KSCORE_TIERS[tierKey] : null
  const trend = k ? kscoreTrend(k) : null
  const kmNum = (n: number) => (locale === "km" ? khmerDigits(String(n)) : String(n))

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_RECEIPT_INPUT_BYTES || !file.type.startsWith("image/")) return void toast.error(t("kscore.invalid"))
    setReading(true)
    try {
      const body = new FormData()
      body.append("image", await compressImage(file, 1800, 0.9), "kscore.jpg")
      const res = await fetch("/api/kscore/ocr", { method: "POST", body }).catch(() => null)
      const json = (await res?.json().catch(() => null)) as { read?: KScoreRead; error?: string } | null
      if (json?.read) setDraft(json.read)
      else toast.error(t(json?.error === "not_kscore" ? "kscore.notKscore" : "kscore.busy"))
    } finally {
      setReading(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ShieldCheckIcon className="size-4" aria-hidden />
          {t("kscore.title")}
        </h2>
        <Button variant="ghost" size="sm" className="h-8 text-primary" disabled={reading} onClick={() => input.current?.click()}>
          {reading ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
          {t(k ? "kscore.update" : "kscore.add")}
        </Button>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      <Card
        className={
          tierKey === "excellent" || tierKey === "good"
            ? "gap-3 border-emerald-200/80 bg-linear-to-br from-emerald-50 via-white to-teal-50/60 px-4 py-4 dark:border-emerald-900/50 dark:from-emerald-500/10 dark:via-transparent dark:to-teal-500/5"
            : "gap-3 px-4 py-4"
        }
      >
        {!k || !tier ? (
          <p className="text-sm text-muted-foreground">{t("kscore.empty")}</p>
        ) : (
          <>
            {/* The gauge with the score inside it: «My K-Score», the number, CBC's band, the date. */}
            <div className="relative mx-auto w-full max-w-[17rem]">
              <Gauge score={k.score} />
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                <p className="text-xs text-muted-foreground">My K-Score</p>
                <p className="text-4xl leading-none font-extrabold tracking-tight tabular-nums">{hidden ? "****" : k.score}</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" style={tierKey === "excellent" || tierKey === "good" ? undefined : { borderColor: `${tier.color}55`, backgroundColor: `${tier.color}14`, color: tier.to }}>
                {tier.dot} {tier.km} · {tier.en}
              </span>
              <p className="text-xs text-muted-foreground">{dayDate(new Date(`${k.scoreDate}T12:00:00`), locale)} · {KSCORE_MIN}–{KSCORE_MAX}</p>
              {trend && !hidden && (
                <p className={`text-sm font-semibold ${trend.delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {trend.delta >= 0 ? "↗ +" : "↘ −"}
                  {Math.abs(trend.delta)}{" "}
                  <span className="font-normal text-muted-foreground">({t(trend.delta >= 0 ? "kscore.rose" : "kscore.fell", { from: kmNum(trend.fromScore), to: kmNum(k.score), n: kmNum(trend.months) })})</span>
                </p>
              )}
            </div>
            <p className="rounded-xl bg-white/70 px-3 py-2 text-xs leading-relaxed text-emerald-900 ring-1 ring-emerald-500/15 dark:bg-white/5 dark:text-emerald-200">
              <span className="font-semibold">{t("kscore.guardian")}</span> {lenders.length ? t("kscore.guardianTip", { lenders: lenders.join(" និង ") }) : t("kscore.guardianGeneric")}
            </p>
          </>
        )}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <LockIcon className="size-3" aria-hidden />
          {t("kscore.private")}
        </p>
      </Card>
      {draft && <ConfirmSheet draft={draft} onClose={() => setDraft(null)} />}
    </section>
  )
}

/** The reading, to check (and correct) before it is saved. */
function ConfirmSheet({ draft, onClose }: { draft: KScoreRead; onClose: () => void }) {
  const t = useT()
  const save = useSaveKScore()
  const [score, setScore] = useState(String(draft.score))
  const [date, setDate] = useState(draft.scoreDate)
  const value = Number(score)
  const valid = Number.isInteger(value) && value >= KSCORE_MIN && value <= KSCORE_MAX && Boolean(date)
  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={t("kscore.confirmTitle")} description={t("kscore.confirmHint")}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ks-score">K-Score</Label>
            <Input id="ks-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, ""))} className="h-11 text-lg font-semibold tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ks-date">{t("kscore.date")}</Label>
            <Input id="ks-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {draft.riskLabel ?? t("kscore.noLabel")}
          {draft.history.length ? ` · ${t("kscore.months", { n: draft.history.length })}` : ""}
        </p>
        <Button
          className="h-11 w-full"
          disabled={!valid || save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ ...draft, score: value, scoreDate: date })
              toast.success(t("kscore.saved"))
              onClose()
            } catch {
              toast.error(t("common.error"))
            }
          }}
        >
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}
