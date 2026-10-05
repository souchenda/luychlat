import { GAUGE_COLOR, GAUGE_EMOJI, gaugeWidth, type PoolSnapshot } from "@/lib/pool"
import { formatMoney } from "@/lib/money"

/**
 * "Enough or not?" — the remaining money as a bar with its status
 * (🟢 safe > 30 %, 🟡 caution 15–30 %, 🔴 low < 15 %). No hooks: also used by
 * the public page (a server component), so labels come in as props.
 */
export function PoolGauge({
  pool,
  labels,
  hidden = false,
}: {
  pool: Pick<PoolSnapshot, "pooled" | "spent" | "remaining" | "pct" | "gauge" | "currency">
  labels: { status: string; pooled: string; spent: string; remaining: string }
  /** The 👁 privacy toggle (app only). */
  hidden?: boolean
}) {
  const color = GAUGE_COLOR[pool.gauge]
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{labels.remaining}</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color }}>
            {formatMoney(pool.remaining, pool.currency, { hidden })}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          {GAUGE_EMOJI[pool.gauge]} {labels.status} · {Math.max(0, Math.round(pool.pct))}%
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gaugeWidth(pool))}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${gaugeWidth(pool)}%`, backgroundColor: color }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{labels.pooled}</p>
          <p className="font-semibold tabular-nums">{formatMoney(pool.pooled, pool.currency, { hidden })}</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{labels.spent}</p>
          <p className="font-semibold tabular-nums">{formatMoney(pool.spent, pool.currency, { hidden })}</p>
        </div>
      </div>
    </div>
  )
}
