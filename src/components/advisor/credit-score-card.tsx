"use client"

import { ChevronDownIcon, CrownIcon, LockIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { scoreTips, type Lang } from "@/lib/advisor/engine"
import {
  SCORE_MAX,
  SCORE_MIN,
  SCORE_WEIGHTS,
  creditBand,
  scoreFraction,
  scoreGaps,
  type CreditBand,
  type ScoreFactor,
} from "@/lib/advisor/credit-score"
import type { Snapshot, SnapshotLabels } from "@/lib/advisor/snapshot"
import { useT } from "@/lib/i18n/use-t"
import { useIsPro } from "@/lib/plan"
import { cn } from "@/lib/utils"

// Bands in score order; colour is paired with the band's text label everywhere.
const BANDS: { band: CreditBand; from: number; to: number; color: string; chip: string }[] = [
  { band: "needs_work", from: 300, to: 580, color: "#ef4444", chip: "bg-red-500/12 text-red-700 dark:text-red-400" },
  { band: "fair", from: 580, to: 670, color: "#f59e0b", chip: "bg-amber-500/15 text-amber-800 dark:text-amber-400" },
  { band: "good", from: 670, to: 740, color: "#84cc16", chip: "bg-lime-500/15 text-lime-800 dark:text-lime-400" },
  { band: "excellent", from: 740, to: 850, color: "#10b981", chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
]
const bandStyle = (band: CreditBand) => BANDS.find((b) => b.band === band)!

const R = 80
const point = (fraction: number, radius = R) => ({
  x: 100 - radius * Math.cos(Math.PI * fraction),
  y: 100 - radius * Math.sin(Math.PI * fraction),
})

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-linear-to-r from-amber-400 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white",
        className,
      )}
    >
      <CrownIcon className="size-2.5" aria-hidden />
      PRO
    </span>
  )
}

/** 300–850 half-circle meter with band arcs and a needle. */
export function ScoreMeter({ score, className }: { score: number; className?: string }) {
  const t = useT()
  const fraction = scoreFraction(score)
  const style = bandStyle(creditBand(score))
  const gap = 0.006
  return (
    <div className={cn("relative mx-auto w-full max-w-[280px]", className)}>
      <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={t("score.meterLabel", { score, band: t(`advisor.band.${style.band}`) })}>
        {BANDS.map((b, i) => {
          const from = point(scoreFraction(b.from) + (i ? gap : 0))
          const to = point(scoreFraction(b.to) - (i < BANDS.length - 1 ? gap : 0))
          const active = b.band === style.band
          return (
            <path
              key={b.band}
              d={`M ${from.x} ${from.y} A ${R} ${R} 0 0 1 ${to.x} ${to.y}`}
              fill="none"
              stroke={b.color}
              strokeWidth={active ? 16 : 12}
              opacity={active ? 1 : 0.35}
            />
          )
        })}
        {/* Needle: drawn pointing at 300, rotated to the score. */}
        <g
          style={{ transform: `rotate(${fraction * 180}deg)`, transformOrigin: "100px 100px" }}
          className="transition-transform duration-1000 ease-out"
        >
          <line x1="100" y1="100" x2="34" y2="100" stroke="var(--foreground)" strokeWidth="3.5" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="7" fill="var(--foreground)" />
        <circle cx="100" cy="100" r="3" fill="var(--background)" />
        <text x="14" y="116" fontSize="9" fill="var(--muted-foreground)" textAnchor="start">
          {SCORE_MIN}
        </text>
        <text x="186" y="116" fontSize="9" fill="var(--muted-foreground)" textAnchor="end">
          {SCORE_MAX}
        </text>
      </svg>
    </div>
  )
}

function FactorRow({
  factor,
  value,
  detail,
  tip,
  points,
}: {
  factor: ScoreFactor
  value: number
  detail: string
  tip?: string
  points: number
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const level = value >= 0.8 ? "bg-emerald-500" : value >= 0.5 ? "bg-amber-500" : "bg-red-500"
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full space-y-1.5 py-2.5 text-left"
        disabled={!tip}
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium">
            {t(`score.factor.${factor}`)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{Math.round(SCORE_WEIGHTS[factor] * 100)}%</span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>
          {tip && <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-[width] duration-700", level)} style={{ width: `${Math.max(value, 0.03) * 100}%` }} />
        </div>
      </button>
      {open && tip && (
        <p className="mb-2 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed">
          {tip} <strong className="text-primary">{t("score.points", { points })}</strong>
        </p>
      )}
    </li>
  )
}

/** Advisor page: the 300–850 meter, the four factors and what to improve first. */
export function CreditScoreCard({
  snapshot,
  labels,
  lang,
  onAskAi,
}: {
  snapshot: Snapshot
  labels: SnapshotLabels
  lang: Lang
  onAskAi: () => void
}) {
  const t = useT()
  const isPro = useIsPro("credit_score")
  const { score, scoreFactors: f } = snapshot
  const style = bandStyle(creditBand(score))
  const tips = new Map(scoreTips(snapshot, labels, lang).map((tip) => [tip.factor, tip]))
  const gaps = scoreGaps(f)
  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`)
  const runway = snapshot.avgExpense > 0 ? snapshot.cashUsd / snapshot.avgExpense : null
  const details: Record<ScoreFactor, string> = {
    repayment: snapshot.overduePayables ? t("score.overdue", { count: snapshot.overduePayables }) : t("score.onTime"),
    dti: pct(snapshot.dti),
    savings: pct(snapshot.savingsRate),
    buffer: runway === null ? "—" : t("score.months", { months: runway.toFixed(1) }),
  }

  return (
    <Card className="relative gap-3 overflow-hidden px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold">
            {t("score.title")}
            <ProBadge />
          </p>
          <p className="text-xs text-muted-foreground">{t("score.subtitle")}</p>
        </div>
      </div>

      <div className={cn("space-y-3", !isPro && "pointer-events-none blur-sm select-none")} aria-hidden={!isPro}>
        <ScoreMeter score={score} />
        <div className="-mt-2 flex flex-col items-center gap-1.5">
          <span className="text-4xl font-bold tabular-nums">{score}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", style.chip)}>{t(`advisor.band.${style.band}`)}</span>
          {gaps.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("score.potential", { points: gaps.reduce((a, g) => a + g.points, 0) })}
            </span>
          )}
        </div>

        <ul className="divide-y">
          {(Object.keys(SCORE_WEIGHTS) as ScoreFactor[]).map((factor) => (
            <FactorRow
              key={factor}
              factor={factor}
              value={f[factor]}
              detail={details[factor]}
              tip={tips.get(factor)?.text}
              points={tips.get(factor)?.points ?? 0}
            />
          ))}
        </ul>

        <Button className="w-full" onClick={onAskAi}>
          <SparklesIcon />
          {t("score.askAi")}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">{t("score.disclaimer")}</p>
      </div>

      {!isPro && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 px-6 text-center">
          <LockIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-semibold">{t("score.proTitle")}</p>
          <Button size="sm" disabled>
            <CrownIcon />
            {t("score.upgrade")}
          </Button>
        </div>
      )}
    </Card>
  )
}
