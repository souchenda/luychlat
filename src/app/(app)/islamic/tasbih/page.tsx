"use client"

import { RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"

const PHRASES = [
  { arabic: "سبحان الله", latin: "SubhanAllah" },
  { arabic: "الحمد لله", latin: "Alhamdulillah" },
  { arabic: "الله أكبر", latin: "Allahu Akbar" },
  { arabic: "لا إله إلا الله", latin: "La ilaha illallah" },
  { arabic: "أستغفر الله", latin: "Astaghfirullah" },
]
const TARGETS = [33, 99, 100, 0] // 0 = no limit
const khmerDigits = (value: string) => value.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** Dhikr counter: tap the big button; rounds of 33 / 99 / 100 with a vibration at the end of each. Kept on this device. */
export default function TasbihPage() {
  const t = useT()
  const { tasbihCount: count, tasbihTarget: target, tasbihPhrase: phrase, setTasbih } = useIslamicLocalStore()
  const inRound = target ? count % target : count
  const rounds = target ? Math.floor(count / target) : 0
  const shown = target && count > 0 && inRound === 0 ? target : inRound
  const progress = target ? shown / target : 0
  const p = PHRASES[phrase] ?? PHRASES[0]

  const tap = () => {
    const next = count + 1
    setTasbih({ tasbihCount: next })
    navigator.vibrate?.(target && next % target === 0 ? [80, 60, 160] : 12)
  }

  return (
    <div className="space-y-5">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {PHRASES.map((x, i) => (
          <button
            key={x.latin}
            type="button"
            onClick={() => setTasbih({ tasbihPhrase: i, tasbihCount: 0 })}
            aria-pressed={phrase === i}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", phrase === i ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground")}
          >
            {x.latin}
          </button>
        ))}
      </div>

      <div className="text-center">
        <p className="text-3xl leading-relaxed" dir="rtl" lang="ar">
          {p.arabic}
        </p>
        <p className="text-sm text-muted-foreground">{p.latin}</p>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={tap}
          className="relative flex size-60 touch-manipulation select-none items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-700 text-white shadow-xl shadow-emerald-900/30 transition-transform active:scale-95"
          aria-label={t("tasbih.tap")}
        >
          {target > 0 && (
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 47}
                strokeDashoffset={2 * Math.PI * 47 * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-150"
              />
            </svg>
          )}
          <span className="flex flex-col items-center">
            <span className="text-6xl font-bold tabular-nums">{khmerDigits(String(shown))}</span>
            {target > 0 && <span className="text-sm text-white/80">/ {khmerDigits(String(target))}</span>}
          </span>
        </button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {target > 0 ? t("tasbih.rounds", { rounds: khmerDigits(String(rounds)), total: khmerDigits(String(count)) }) : t("tasbih.total", { total: khmerDigits(String(count)) })}
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label={t("tasbih.target")}>
          {TARGETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTasbih({ tasbihTarget: n, tasbihCount: 0 })}
              aria-pressed={target === n}
              className={cn("min-w-11 rounded-full px-3 py-1.5 text-sm", target === n ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground")}
            >
              {n ? khmerDigits(String(n)) : "∞"}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => count > 0 && window.confirm(t("tasbih.resetConfirm")) && setTasbih({ tasbihCount: 0 })}>
          <RotateCcwIcon />
          {t("tasbih.reset")}
        </Button>
      </div>
    </div>
  )
}
