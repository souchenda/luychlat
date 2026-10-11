"use client"

import { PlayIcon, Volume2Icon, VolumeXIcon, WifiOffIcon } from "lucide-react"
import Link from "next/link"
import QRCode from "qrcode"
import { useEffect, useMemo, useRef, useState } from "react"

import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useActiveWorkspace, useWorkspaces } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { codeLabel, selectedCode } from "@/lib/khqr-codes"
import { useWorkspaceKhqrs } from "@/lib/khqr-codes-data"
import { announceLate, keepScreenAwake, pollSince, receiveEvent, shownAmount, soundboxWorkspace, SOUNDBOX_MODES, todayTotals, type SoundboxEvent, type SoundboxMode } from "@/lib/soundbox"
import { announce, unlockAudio, type AnnounceResult } from "@/lib/soundbox-audio"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

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
  const workspaces = useWorkspaces().data
  const userId = useSessionStore((s) => s.user?.id ?? null)
  // The business's codes, even while the Personal workspace is open.
  const counter = soundboxWorkspace(workspace, workspaces)
  const codes = useWorkspaceKhqrs(counter?.id).data ?? []
  const [live, setLive] = useState<"connecting" | "live" | "down">("connecting")
  const [audioIssue, setAudioIssue] = useState<AnnounceResult | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  // The default on load; a tap switches at once (for the customer's bank or currency).
  const current = selectedCode(codes, chosen)
  const khqr = current?.khqr_payload ?? null
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

  /** A payment arrived (live, or by the backup check): flash, list, sound — once. */
  const handle = useRef<(row: Record<string, unknown>, late: boolean) => void>(() => {})
  handle.current = (row, late) => {
    const { list: next, added } = receiveEvent(eventsRef.current, row)
    if (!added) return
    eventsRef.current = next
    setEvents(next)
    // One that came in while the connection was down: listed, announced only if still fresh.
    if (late && !announceLate(added.created_at, Date.now())) return
    setFlash(added)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS)
    void announce(added, settings.current.mode, settings.current.soundOn, settings.current.volume / 100).then((r) => setAudioIssue(r === "locked" || r === "error" ? r : null))
  }
  const flashTimer = useRef<number | undefined>(undefined)

  // Today's receipts in every workspace the user belongs to (RLS), then each new one live — the
  // payment's workspace needn't be the one open in the app.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !userId) return
    const columns = "id, workspace_id, amount, currency, account_name, payer, payer_bank, transaction_time, created_at"
    void supabase
      .from("soundbox_events")
      .select(columns)
      .gte("transaction_time", new Date(Date.parse(`${ppDay()}T00:00:00+07:00`)).toISOString())
      .order("transaction_time", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const today = ((data ?? []) as SoundboxEvent[]).map((e) => ({ ...e, amount: Number(e.amount) }))
        eventsRef.current = [...eventsRef.current, ...today.filter((e) => !eventsRef.current.some((x) => x.id === e.id))]
        setEvents(eventsRef.current)
      })
    const channel = supabase
      .channel(`soundbox:${userId}`)
      .on("postgres_changes", { schema: "public", table: "soundbox_events", event: "INSERT" }, ({ new: row }) => handle.current(row as Record<string, unknown>, false))
      .subscribe((status, err) => {
        setLive(status === "SUBSCRIBED" ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "down" : "connecting")
        if (err) console.error("[soundbox] realtime:", status, err)
      })
    // The backup check: every 15 s and when the page comes back (phones drop sockets in the background).
    const poll = async () => {
      const { data, error } = await supabase.from("soundbox_events").select(columns).gt("created_at", pollSince(eventsRef.current, Date.now() - 60_000)).order("created_at").limit(50)
      if (error) return console.error("[soundbox] backup check:", error.message)
      for (const row of data ?? []) handle.current(row as Record<string, unknown>, true)
    }
    const every = window.setInterval(() => void poll(), 15_000)
    const onShow = () => document.visibilityState === "visible" && void poll()
    document.addEventListener("visibilitychange", onShow)
    return () => {
      window.clearInterval(every)
      window.clearTimeout(flashTimer.current)
      document.removeEventListener("visibilitychange", onShow)
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const totals = useMemo(() => todayTotals(events, ppDay()), [events])

  const start = async () => {
    await unlockAudio()
    setActive(true)
    setAudioIssue(null)
  }

  return (
    <div className="space-y-4">
      <SettingsSubHeader title={t("soundbox.title")} back="/home" />

      {/* Never silent without saying so: the sound held by the phone, or the live connection down. */}
      {audioIssue && (
        <button type="button" onClick={() => void start()} className="flex w-full items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-left text-sm font-medium text-rose-900 dark:text-rose-200">
          <VolumeXIcon className="size-5 shrink-0" aria-hidden />
          {t(audioIssue === "locked" ? "soundbox.audioLocked" : "soundbox.audioError")}
        </button>
      )}
      {live === "down" && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          <WifiOffIcon className="size-4 shrink-0" aria-hidden />
          {t("soundbox.offline")}
        </p>
      )}

      {!active ? (
        <Button type="button" className="h-14 w-full text-base" onClick={() => void start()}>
          <Volume2Icon />
          {t("soundbox.start")}
        </Button>
      ) : (
        <Card className="flex-row items-center gap-3 px-4 py-3">
          {soundOn ? <Volume2Icon className="size-5 text-primary" aria-hidden /> : <VolumeXIcon className="size-5 text-muted-foreground" aria-hidden />}
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t(soundOn ? "soundbox.listening" : "soundbox.muted")}
            <span className={cn("ml-1.5 inline-block size-2 rounded-full align-middle", live === "live" ? "bg-emerald-500" : live === "down" ? "bg-rose-500" : "bg-amber-400")} aria-label={live} />
          </span>
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
              void announce({ amount: 50_000, currency: "KHR" }, mode, true, volume / 100).then((r) => setAudioIssue(r === "locked" || r === "error" ? r : null))
            }}
          >
            <PlayIcon />
            {t("soundbox.test")}
          </Button>
        </div>
      </Card>

      {/* The workspace's KHQR, large, for the customer to scan — switch bank / currency with one tap. */}
      <Card className="items-center gap-3 px-4 py-5">
        {codes.length > 1 && (
          <div className="flex w-full gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={t("khqr.title")}>
            {codes.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={current?.id === c.id}
                onClick={() => setChosen(c.id)}
                className={cn(
                  "shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                  current?.id === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground",
                )}
              >
                {codeLabel(c)}
              </button>
            ))}
          </div>
        )}
        {current && <p className="text-center text-base font-semibold">{current.merchant_name ?? codeLabel(current)}</p>}
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
