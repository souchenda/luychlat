"use client"

import { XIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { todayDate } from "@/lib/debts"
import { activeGreeting, shouldShowSplash, splashMark, type GreetingKey } from "@/lib/festive-greeting"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"

const STORE = "luychlat:festive-splash"
const GOLD = "#E2B354"

/** Gold line art on the brand emerald: pagoda spire, lotuses and a tiffin carrier (ចានស្រាក់) — or the Water Festival's boat and moon. */
export function FestiveArt({ festival }: { festival: GreetingKey }) {
  const lotus = (x: number, y: number, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke={GOLD} strokeWidth={2} fill="none" strokeLinejoin="round">
      <path d="M0 0 C -6 -10 -6 -20 0 -28 C 6 -20 6 -10 0 0 Z" fill={`${GOLD}33`} />
      <path d="M0 0 C -12 -6 -18 -14 -18 -22 C -9 -20 -4 -12 0 0" />
      <path d="M0 0 C 12 -6 18 -14 18 -22 C 9 -20 4 -12 0 0" />
      <path d="M-22 2 Q 0 10 22 2" />
    </g>
  )
  return (
    <svg viewBox="0 0 320 200" className="h-auto w-full" role="img" aria-hidden>
      <defs>
        <radialGradient id="fg-glow" cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#064e3b" stopOpacity="1" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" rx="24" fill="url(#fg-glow)" />
      {/* Stars of light */}
      {[
        [40, 30],
        [280, 40],
        [60, 150],
        [262, 140],
        [160, 18],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill={GOLD} opacity={0.8} />
      ))}
      {festival === "water_festival" ? (
        <g stroke={GOLD} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="250" cy="52" r="20" fill={`${GOLD}40`} />
          <path d="M40 132 Q 160 154 284 128 L 270 140 Q 160 162 52 142 Z" fill={`${GOLD}30`} />
          <path d="M276 128 Q 296 112 300 96" />
          {[70, 100, 130, 160, 190, 220, 250].map((x) => (
            <path key={x} d={`M${x} 138 L ${x - 10} 118`} />
          ))}
          <path d="M20 168 Q 60 156 100 168 T 180 168 T 260 168 T 320 166" opacity={0.7} />
        </g>
      ) : (
        <g stroke={GOLD} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* Pagoda spire */}
          <path d="M160 26 L 160 44 M152 52 L 160 40 L 168 52 M146 68 L 160 50 L 174 68 M140 86 L 160 62 L 180 86" />
          <path d="M132 108 L 140 86 L 180 86 L 188 108 Z" fill={`${GOLD}26`} />
          <path d="M120 128 L 132 108 L 188 108 L 200 128 Z" fill={`${GOLD}1f`} />
          <path d="M110 150 L 210 150 M118 128 L 118 150 M202 128 L 202 150 M150 128 L 150 150 M170 128 L 170 150" />
          {festival === "pchum_ben" && (
            // Tiffin carrier (ចានស្រាក់): three stacked bowls and a handle.
            <g transform="translate(244 104)">
              <path d="M-16 -32 Q 0 -54 16 -32" />
              <rect x="-20" y="-32" width="40" height="13" rx="4" fill={`${GOLD}30`} />
              <rect x="-20" y="-17" width="40" height="13" rx="4" fill={`${GOLD}30`} />
              <rect x="-20" y="-2" width="40" height="13" rx="4" fill={`${GOLD}30`} />
              <path d="M-12 15 L 12 15" />
            </g>
          )}
        </g>
      )}
      {festival !== "water_festival" && (
        <>
          {lotus(72, 150, 1.1)}
          {festival === "khmer_new_year" && lotus(248, 150, 1.1)}
          {lotus(40, 168, 0.7)}
          {lotus(286, 172, 0.7)}
        </>
      )}
    </svg>
  )
}

function useGreeting() {
  const params = useSearchParams()
  const islamic = useIslamicEnabled()
  const [today, setToday] = useState<string | null>(null)
  // Client-only: the date comes from this device.
  useEffect(() => setToday(todayDate()), [])
  return today ? activeGreeting(today, { islamic, preview: params.get("festive") }) : null
}

function Splash() {
  const t = useT()
  const greeting = useGreeting()
  const [open, setOpen] = useState(false)
  const key = greeting?.key

  useEffect(() => {
    if (!key) return
    const today = todayDate()
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORE)
    } catch {}
    if (shouldShowSplash(stored, key, today) || greeting?.day === null) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per festival key
  }, [key])

  if (!key) return null
  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(STORE, splashMark(key, todayDate()))
    } catch {}
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-0 overflow-hidden rounded-3xl border-amber-300/40 p-0 animate-in fade-in-0 zoom-in-95 duration-500">
        <div className="relative">
          <FestiveArt festival={key} />
          <button type="button" onClick={close} aria-label={t("common.close")} className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="space-y-3 bg-linear-to-b from-emerald-950 to-emerald-900 px-6 pt-5 pb-6 text-center">
          <DialogTitle className="bg-linear-to-r from-amber-200 via-amber-300 to-amber-200 bg-clip-text text-2xl leading-snug font-bold text-transparent">
            {t(`festive.${key}.title` as MessageKey)}
          </DialogTitle>
          <p className="text-sm leading-relaxed text-emerald-50/90">{t(`festive.${key}.body` as MessageKey)}</p>
          <button
            type="button"
            onClick={close}
            className="mt-1 h-12 w-full rounded-2xl bg-linear-to-r from-amber-300 to-amber-400 text-base font-bold text-emerald-950 shadow-lg shadow-amber-500/20 transition-transform active:scale-[0.98]"
          >
            {t(`festive.${key}.ok` as MessageKey)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Badge() {
  const t = useT()
  const greeting = useGreeting()
  if (!greeting) return null
  return (
    <p className="mx-auto max-w-md px-4 pb-1.5 text-center text-[11px] font-semibold text-amber-700 dark:text-amber-300 animate-in fade-in-0 duration-500">
      {t(`festive.${greeting.key}.badge` as MessageKey)}
    </p>
  )
}

/** The festival's greeting splash, once a day (on app load). */
export function FestiveSplash() {
  return (
    <Suspense fallback={null}>
      <Splash />
    </Suspense>
  )
}

/** The festival's line under the header bar. */
export function FestiveBadge() {
  return (
    <Suspense fallback={null}>
      <Badge />
    </Suspense>
  )
}
