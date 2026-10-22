"use client"

import { BellRingIcon, PlayIcon, Volume2Icon, VolumeXIcon, WifiOffIcon } from "lucide-react"
import Link from "next/link"
import QRCode from "qrcode"
import { useEffect, useMemo, useRef, useState } from "react"

import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { SoundboxStatus } from "@/components/soundbox/soundbox-status"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActiveWorkspace, useWorkspaces } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { codeLabel, selectedCode } from "@/lib/khqr-codes"
import { useWorkspaceKhqrs } from "@/lib/khqr-codes-data"
import {
  announceLate,
  audioIssueOf,
  devicePlatform,
  HEARTBEAT_MS,
  isLatePush,
  keepScreenAwake,
  pollSince,
  readSoundboxEnabled,
  readVoiceSpeed,
  receiveEvent,
  reconnectDelay,
  shownAmount,
  soundboxWorkspace,
  SOUNDBOX_MODES,
  todayTotals,
  writeSoundboxEnabled,
  type AudioIssue,
  type WakeState,
  type SoundboxEvent,
  type SoundboxMode,
} from "@/lib/soundbox"
import { announce, isUnlocked, speechNeedsTap, unlockAudio, warmSpeech } from "@/lib/soundbox-audio"
import { enablePush, pushState, type PushState } from "@/lib/push"
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
const store = () => {
  try {
    return window.localStorage
  } catch {
    return null
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
function useWakeLock(on: boolean): WakeState | null {
  const [state, setState] = useState<WakeState | null>(null)
  useEffect(() => {
    if (!on) {
      setState(null)
      return
    }
    return keepScreenAwake(navigator as Parameters<typeof keepScreenAwake>[0], document, setState)
  }, [on])
  return state
}

type Db = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>

/**
 * An RPC that survives an expired sign-in: a page left open for hours (iOS freezes the refresh timer
 * while hidden) holds an old token — refreshed once and tried again, else the error is returned.
 */
async function rpcFresh(supabase: Db, fn: string, args: Record<string, unknown>): Promise<string | null> {
  let { error } = await supabase.rpc(fn, args)
  if (error && /jwt|token|401|expired/i.test(`${error.message} ${error.code ?? ""}`)) {
    await supabase.auth.refreshSession().catch(() => null)
    ;({ error } = await supabase.rpc(fn, args))
  }
  if (error) console.error(`[soundbox] ${fn}:`, error.message)
  return error ? error.message : null
}

/** This browser's SoundBox id (one row in soundbox_devices), made once and kept. */
function deviceId(): string | null {
  try {
    const s = store()
    let id = s?.getItem("soundbox_device_id") ?? null
    if (!id && typeof crypto !== "undefined" && "randomUUID" in crypto) {
      id = crypto.randomUUID()
      s?.setItem("soundbox_device_id", id)
    }
    return id
  } catch {
    return null
  }
}

/**
 * The heartbeat (founder, 14/10/2026): every minute while /soundbox is open, and at once when anything
 * changes — page shown or hidden, sound unlocked, live connection, wake lock. The business sees whether
 * a counter phone is ready (the in-app status only — no Telegram alerts: founder, 15/10/2026).
 */
function useHeartbeat(workspaceId: string | null, on: boolean, state: { audioOk: boolean; live: boolean; wake: WakeState | null }): { id: string | null; error: string | null } {
  const latest = useRef(state)
  latest.current = state
  const [error, setError] = useState<string | null>(null)
  const [id] = useState(() => (typeof window === "undefined" ? null : deviceId()))
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId || !id) return
    const beat = (visible = document.visibilityState === "visible") => {
      const s = latest.current
      void rpcFresh(supabase, "soundbox_heartbeat", {
        p_device: id,
        p_workspace: workspaceId,
        p_state: { visible, audio_unlocked: on && isUnlocked() && s.audioOk, live: s.live, wake: s.wake, platform: devicePlatform(navigator.userAgent) },
      }).then((e) => {
        if (visible) setError(e)
      })
    }
    beat()
    const every = window.setInterval(() => beat(), HEARTBEAT_MS)
    const onVisibility = () => beat()
    const onShow = () => beat()
    const onHide = () => beat(false)
    document.addEventListener("visibilitychange", onVisibility)
    // Back from the iOS page cache: no remount — beat at once.
    window.addEventListener("pageshow", onShow)
    window.addEventListener("pagehide", onHide)
    return () => {
      window.clearInterval(every)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pageshow", onShow)
      window.removeEventListener("pagehide", onHide)
      // Leaving /soundbox: not ready any more.
      beat(false)
    }
  }, [workspaceId, on, id, state.audioOk, state.live, state.wake])
  return { id, error }
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
  const [audioIssue, setAudioIssue] = useState<AudioIssue | null>(null)
  const [testLog, setTestLog] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  // The default on load; a tap switches at once (for the customer's bank or currency).
  const current = selectedCode(codes, chosen)
  const khqr = current?.khqr_payload ?? null
  const [qr, setQr] = useState<string | null>(null)
  // On / off, remembered for this business (soundbox_enabled_<workspace>): a reload, a remount or a
  // dropped connection never turns it off — only «🔇 បិទសំឡេង» does.
  const counterId = counter?.id ?? null
  const [enabled, setEnabledState] = useState(false)
  useEffect(() => {
    const on = readSoundboxEnabled(store(), counterId)
    setEnabledState(on)
    // Restored on: the browser needs one touch before it plays sound again — say so until then.
    if (on && !isUnlocked()) setAudioIssue("locked")
  }, [counterId])
  const setEnabled = (on: boolean) => {
    setEnabledState(on)
    writeSoundboxEnabled(store(), counterId, on)
  }
  // Payments with the screen locked: the phone push (the browser may be asleep) — offered until it is on.
  const [push, setPush] = useState<PushState | null>(null)
  useEffect(() => {
    void pushState().then(setPush)
  }, [])
  const [mode, setMode] = useState<SoundboxMode>(() => {
    const saved = typeof window === "undefined" ? "km" : pref("soundbox.lang", "km")
    return (SOUNDBOX_MODES as string[]).includes(saved) ? (saved as SoundboxMode) : "km"
  })
  const [volume, setVolume] = useState(() => (typeof window === "undefined" ? 100 : Number(pref("soundbox.volume", "100")) || 100))
  const [events, setEvents] = useState<SoundboxEvent[]>([])
  const eventsRef = useRef<SoundboxEvent[]>([])
  const [flash, setFlash] = useState<SoundboxEvent | null>(null)
  const settings = useRef({ soundOn: enabled, mode, volume })
  settings.current = { soundOn: enabled, mode, volume }
  const wake = useWakeLock(enabled)
  const heartbeat = useHeartbeat(counterId, enabled, { audioOk: audioIssue !== "locked", live: live === "live", wake })

  // The first touch anywhere on the page after a reload brings the sound back (browsers allow audio
  // only after a gesture); the SoundBox itself stays on throughout.
  useEffect(() => {
    if (!enabled) return
    const wake = () => {
      // Speech not proven yet (or it failed): this touch primes it again — synchronously, inside the
      // touch, which is the only moment iOS accepts it.
      if (isUnlocked()) {
        if (speechNeedsTap()) {
          warmSpeech()
          setAudioIssue((issue) => (issue === "voice" ? null : issue))
        }
        return
      }
      void unlockAudio(readVoiceSpeed(store())).then((ok) => ok && setAudioIssue(null))
    }
    document.addEventListener("pointerdown", wake, true)
    document.addEventListener("keydown", wake, true)
    return () => {
      document.removeEventListener("pointerdown", wake, true)
      document.removeEventListener("keydown", wake, true)
    }
  }, [enabled])

  useEffect(() => {
    if (khqr) void QRCode.toDataURL(khqr, { width: 720, margin: 2, errorCorrectionLevel: "M" }).then(setQr)
    else setQr(null)
  }, [khqr])

  /** A payment arrived (live, or by the backup check): flash, list, sound — once. */
  const handle = useRef<(row: Record<string, unknown>, late: boolean) => void>(() => {})
  handle.current = (row, late) => {
    const { list: next, added } = receiveEvent(eventsRef.current, row)
    if (!added) return
    // When this phone got it: «rx:<ms after it was recorded>» (live or by the backup check) leads the report.
    const received = [`rx:${added.created_at ? Math.max(0, Date.now() - Date.parse(added.created_at)) : "?"}`, late ? "poll" : "live"]
    eventsRef.current = next
    setEvents(next)
    const report = (log: string[]) => {
      const supabase = getSupabaseBrowserClient()
      if (supabase) void rpcFresh(supabase, "soundbox_report", { p_event: added.id, p_log: [...received, ...log].join(" ").slice(0, 500), p_ua: navigator.userAgent.slice(0, 200) })
    }
    // A late push (the bank's time over 10 minutes before the server got it): listed only — never rung,
    // spoken or flashed, an hours-old chime would look like a customer paying now (founder, 14/10/2026).
    if (isLatePush(added.transaction_time, added.created_at ?? Date.now())) {
      report([document.visibilityState, "late"])
      return
    }
    // One that came in while the connection was down: listed, announced only if still fresh.
    if (late && !announceLate(added.created_at, Date.now())) return
    setFlash(added)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS)
    void announce(added, settings.current.mode, settings.current.soundOn, settings.current.volume / 100, readVoiceSpeed(store())).then((r) => {
      setAudioIssue(audioIssueOf(r))
      // What the phone did (chime, each voice attempt, the melody) is kept with the payment — a silent
      // announcement is diagnosed from facts, never guessed.
      if (r.result !== "muted") report(r.log)
    })
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
    // The live channel, rejoined silently with a growing delay (1 s … 30 s) whenever it drops — a
    // dropped connection only changes the status dot, never the SoundBox's on/off.
    let channel: ReturnType<typeof supabase.channel> | null = null
    let attempt = 0
    let retry: number | undefined
    let stopped = false
    const connect = () => {
      if (stopped) return
      const ch = supabase
        .channel(`soundbox:${userId}:${Date.now()}`)
        .on("postgres_changes", { schema: "public", table: "soundbox_events", event: "INSERT" }, ({ new: row }) => handle.current(row as Record<string, unknown>, false))
      channel = ch
      ch.subscribe((status, err) => {
        if (stopped || channel !== ch) return
        if (status === "SUBSCRIBED") {
          attempt = 0
          setLive("live")
          return
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (err) console.error("[soundbox] realtime:", status, err)
          setLive("down")
          channel = null
          void supabase.removeChannel(ch)
          window.clearTimeout(retry)
          retry = window.setTimeout(connect, reconnectDelay(attempt++))
          return
        }
        setLive("connecting")
      })
    }
    connect()
    // The backup check: every 15 s and when the page comes back (phones drop sockets in the background).
    const poll = async () => {
      const { data, error } = await supabase.from("soundbox_events").select(columns).gt("created_at", pollSince(eventsRef.current, Date.now() - 60_000)).order("created_at").limit(50)
      if (error) return console.error("[soundbox] backup check:", error.message)
      for (const row of data ?? []) handle.current(row as Record<string, unknown>, true)
    }
    const every = window.setInterval(() => void poll(), 15_000)
    const onShow = () => {
      if (document.visibilityState !== "visible") return
      void poll()
      // The live connection dropped while hidden (iOS / Android freeze sockets): rejoin now, not after the back-off.
      if (!channel && !stopped) {
        window.clearTimeout(retry)
        attempt = 0
        connect()
      }
    }
    document.addEventListener("visibilitychange", onShow)
    return () => {
      stopped = true
      window.clearInterval(every)
      window.clearTimeout(retry)
      window.clearTimeout(flashTimer.current)
      document.removeEventListener("visibilitychange", onShow)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId])

  const totals = useMemo(() => todayTotals(events, ppDay()), [events])

  const start = async () => {
    const ok = await unlockAudio(readVoiceSpeed(store()))
    setEnabled(true)
    setAudioIssue(ok ? null : "locked")
  }

  return (
    <div className="space-y-4">
      <SettingsSubHeader title={t("soundbox.title")} back="/home" />
      {/* This phone's own state (never «not connected» about itself while it is the SoundBox), then the business's other phones. */}
      <SoundboxStatus
        workspaceId={counterId}
        self={{ id: heartbeat.id, ready: enabled && audioIssue !== "locked" && live === "live" && isUnlocked(), error: heartbeat.error }}
      />

      {/* Never silent without saying so: the sound held by the phone, or the live connection down. */}
      {audioIssue && (
        <button type="button" onClick={() => void start()} className="flex w-full items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-left text-sm font-medium text-rose-900 dark:text-rose-200">
          <VolumeXIcon className="size-5 shrink-0" aria-hidden />
          {t(audioIssue === "locked" ? "soundbox.audioLocked" : audioIssue === "voice" ? "soundbox.voiceFailed" : "soundbox.audioError")}
        </button>
      )}
      {/* The phone won't keep the screen on by itself: say how to, instead of a SoundBox that goes dark. */}
      {enabled && (wake === "unsupported" || wake === "denied") && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">{t("soundbox.screenTimeout")}</p>
      )}
      {live === "down" && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          <WifiOffIcon className="size-4 shrink-0" aria-hidden />
          {t("soundbox.offline")}
        </p>
      )}

      {!enabled ? (
        <Button type="button" className="h-14 w-full text-base" onClick={() => void start()}>
          <Volume2Icon />
          {t("soundbox.start")}
        </Button>
      ) : (
        <Card className="flex-row items-center gap-3 border-emerald-500/40 bg-emerald-500/5 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t("soundbox.activeOn")}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("inline-block size-2 rounded-full", live === "live" ? "bg-emerald-500" : live === "down" ? "bg-rose-500" : "bg-amber-400")} aria-label={live} />
              {t("soundbox.listening")}
            </span>
          </span>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setEnabled(false)}>
            {t("soundbox.mute")}
          </Button>
        </Card>
      )}

      {enabled && push && push !== "on" && push !== "unsupported" && (
        <button
          type="button"
          onClick={() => void enablePush().then(setPush)}
          className="flex w-full items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-left text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          <BellRingIcon className="size-5 shrink-0" aria-hidden />
          {t(push === "denied" ? "soundbox.pushDenied" : "soundbox.pushOffer")}
        </button>
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
              await unlockAudio(readVoiceSpeed(store()))
              void announce({ amount: 50_000, currency: "KHR" }, mode, true, volume / 100, readVoiceSpeed(store())).then((r) => {
                setAudioIssue(audioIssueOf(r))
                // What the phone did, on screen: «visible chime km:timeout … en:spoken».
                setTestLog(r.log.join(" "))
              })
            }}
          >
            <PlayIcon />
            {t("soundbox.test")}
          </Button>
        </div>
        {testLog && <p className="mt-2 font-mono text-xs break-words text-muted-foreground">{testLog}</p>}
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
