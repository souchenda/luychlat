"use client"

import { PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import Link from "next/link"
import QRCode from "qrcode"
import { useEffect, useMemo, useRef, useState } from "react"

import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { useMyKhqr } from "@/lib/profile"
import { keepScreenAwake, receiveEvent, shownAmount, SOUNDBOX_MODES, todayTotals, type SoundboxEvent, type SoundboxMode } from "@/lib/soundbox"
import { announce, unlockAudio } from "@/lib/soundbox-audio"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const FLASH_MS = 6_000
const ppDay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
const hhmm = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)
const pref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode: not remembered
  }
}

/** Keeps the counter phone's screen on while the SoundBox is active (keepScreenAwake, re-taken when the page is shown again). */
function useWakeLock(on: boolean) {
  useEffect(() => (on ? keepScreenAwake(navigator as Parameters<typeof keepScreenAwake>[0], document) : undefined), [on])
}

const MODE_LABEL: Record<SoundboxMode, string> = {
  km: "🇰🇭 ខ្មែរ",
  en: "🇬🇧 English",
  zh: "🇨🇳 中文",
  "km+en": "🌐 ខ្មែរ + អង់គ្លេស",
  "km+zh": "🌐 ខ្មែរ + ចិន",
}

/**
 * /soundbox — the cashier screen: the KHQR for customers to scan, and each payment recorded by
 * /api/khqr/ingest announced live (chime + the amount spoken), flashed full screen for 6 seconds,
 * then listed in today's receipts.
 */
export default function SoundboxPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const khqr = useMyKhqr().payload
  const [qr, setQr] = useState<string | null>(null)
  const [active, setActive] = useState(false)
  const [soundOn, setSoundOn] = useState(() => (typeof window === "undefined" ? true : pref("soundbox.sound", "on") === "on"))
  const [mode, setMode] = useState<SoundboxMode>(() => {
    const saved = typeof window === "undefined" ? "km" : pref("soundbox.lang", "km")
    return (SOUNDBOX_MODES as string[]).includes(saved) ? (saved as SoundboxMode) : "km"
  })
  const [volume, setVolume] = useState(() => (typeof window === "undefined" ? 100 : Number(pref("soundbox.volume", "100")) || 100))
  const [events, setEvents] = useState<SoundboxEvent[]>([])
  const eventsRef = useRef<SoundboxEvent[]>([])
  const [flash, setFlash] = useState<SoundboxEvent | null>(null)
  const settings = useRef({ soundOn, mode, volume })
  settings.current = { soundOn, mode, volume }
  useWakeLock(active)

  useEffect(() => {
    if (khqr) void QRCode.toDataURL(khqr, { width: 720, margin: 2, errorCorrectionLevel: "M" }).then(setQr)
    else setQr(null)
  }, [khqr])

  // Today's receipts, then each new one live (Realtime, members of this workspace only).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !ws) return
    let timer: number | undefined
    void supabase
      .from("soundbox_events")
      .select("id, amount, currency, account_name, payer, payer_bank, transaction_time")
      .eq("workspace_id", ws)
      .gte("transaction_time", new Date(Date.parse(`${ppDay()}T00:00:00+07:00`)).toISOString())
      .order("transaction_time", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const today = ((data ?? []) as SoundboxEvent[]).map((e) => ({ ...e, amount: Number(e.amount) }))
        // Anything that arrived live meanwhile stays on top.
        eventsRef.current = [...eventsRef.current, ...today.filter((e) => !eventsRef.current.some((x) => x.id === e.id))]
        setEvents(eventsRef.current)
      })
    const channel = supabase
      .channel(`workspace:${ws}:soundbox`)
      .on("postgres_changes", { schema: "public", table: "soundbox_events", event: "INSERT", filter: `workspace_id=eq.${ws}` }, ({ new: row }) => {
        // Side effects outside the state updater (React may run an updater twice): announced once.
        const { list: next, added } = receiveEvent(eventsRef.current, row as Record<string, unknown>)
        if (!added) return
        eventsRef.current = next
        setEvents(next)
        setFlash(added)
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setFlash(null), FLASH_MS)
        void announce(added, settings.current.mode, settings.current.soundOn, settings.current.volume / 100)
      })
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [ws])

  const totals = useMemo(() => todayTotals(events, ppDay()), [events])

  const start = async () => {
    await unlockAudio()
    setActive(true)
  }

  return (
    <div className="space-y-4">
      <SettingsSubHeader title={t("soundbox.title")} back="/home" />

      {!active ? (
        <Button type="button" className="h-14 w-full text-base" onClick={() => void start()}>
          <Volume2Icon />
          {t("soundbox.start")}
        </Button>
      ) : (
        <Card className="flex-row items-center gap-3 px-4 py-3">
          {soundOn ? <Volume2Icon className="size-5 text-primary" aria-hidden /> : <VolumeXIcon className="size-5 text-muted-foreground" aria-hidden />}
          <span className="min-w-0 flex-1 text-sm font-medium">{t(soundOn ? "soundbox.listening" : "soundbox.muted")}</span>
          <Switch
            checked={soundOn}
            aria-label={t("soundbox.sound")}
            onCheckedChange={(v) => {
              setSoundOn(v)
              keep("soundbox.sound", v ? "on" : "off")
            }}
          />
        </Card>
      )}

      <Card className="gap-3 px-4 py-3">
        <Select
          value={mode}
          onValueChange={(v) => {
            setMode(v as SoundboxMode)
            keep("soundbox.lang", v)
          }}
        >
          <SelectTrigger aria-label={t("soundbox.voice")} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOUNDBOX_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3">
          <VolumeXIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            aria-label={t("soundbox.volume")}
            onChange={(e) => {
              setVolume(Number(e.target.value))
              keep("soundbox.volume", e.target.value)
            }}
            className="h-2 min-w-0 flex-1 accent-primary"
          />
          <Volume2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await unlockAudio()
              void announce({ amount: 50_000, currency: "KHR" }, mode, true, volume / 100)
            }}
          >
            <PlayIcon />
            {t("soundbox.test")}
          </Button>
        </div>
      </Card>

      {/* The workspace's KHQR, large, for the customer to scan. */}
      <Card className="items-center gap-3 px-4 py-5">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={qr} alt="KHQR" className="aspect-square w-full max-w-xs rounded-xl bg-white p-2" />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {t("soundbox.noKhqr")}{" "}
            <Link href="/invoices" className="font-medium text-primary underline">
              {t("soundbox.addKhqr")}
            </Link>
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground">{t("soundbox.scanHint")}</p>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-semibold">{t("soundbox.today", { count: totals.count })}</span>
          <span className="text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {[totals.khr ? shownAmount(totals.khr, "KHR") : null, totals.usd ? shownAmount(totals.usd, "USD") : null].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("soundbox.empty")}</p>
        ) : (
          <ul className="divide-y">
            {events.slice(0, 50).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{hhmm(e.transaction_time)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {e.payer ?? e.account_name}
                  {e.payer_bank ? <span className="text-muted-foreground"> · {e.payer_bank}</span> : null}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{shownAmount(e.amount, e.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="px-1 text-center text-[11px] text-muted-foreground">{t("soundbox.hint")}</p>

      {/* A payment: full-screen green for 6 seconds (tap to close). */}
      {flash && (
        <button
          type="button"
          onClick={() => setFlash(null)}
          className={cn("fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-emerald-600 px-6 text-white", "animate-in fade-in zoom-in-95 duration-300")}
          aria-live="assertive"
        >
          <span className="text-lg font-medium opacity-90">{t("soundbox.received")}</span>
          <span className="text-6xl font-extrabold tracking-tight tabular-nums sm:text-7xl">{shownAmount(flash.amount, flash.currency)}</span>
          {(flash.payer || flash.payer_bank) && (
            <span className="text-xl font-semibold">{[flash.payer, flash.payer_bank].filter(Boolean).join(" · ")}</span>
          )}
          <span className="text-base opacity-90">
            {flash.account_name} · {hhmm(flash.transaction_time)}
          </span>
        </button>
      )}
    </div>
  )
}
