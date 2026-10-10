"use client"

import { Volume2Icon, VolumeXIcon } from "lucide-react"
import Link from "next/link"
import QRCode from "qrcode"
import { useEffect, useMemo, useRef, useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { useMyKhqr } from "@/lib/profile"
import { shownAmount, todayTotals, type SoundboxEvent, type SoundboxLang } from "@/lib/soundbox"
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

/** Keeps the counter phone's screen on while the SoundBox is open (re-taken when the page is shown again). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }
    const take = () => void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => null)
    const onShow = () => document.visibilityState === "visible" && take()
    take()
    document.addEventListener("visibilitychange", onShow)
    return () => {
      document.removeEventListener("visibilitychange", onShow)
      void lock?.release().catch(() => null)
    }
  }, [on])
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
  const [lang, setLang] = useState<SoundboxLang>(() => (typeof window === "undefined" ? "km" : (pref("soundbox.lang", "km") as SoundboxLang)))
  const [events, setEvents] = useState<SoundboxEvent[]>([])
  const [flash, setFlash] = useState<SoundboxEvent | null>(null)
  const settings = useRef({ soundOn, lang })
  settings.current = { soundOn, lang }
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
      .select("id, amount, currency, account_name, payer, transaction_time")
      .eq("workspace_id", ws)
      .gte("transaction_time", new Date(Date.parse(`${ppDay()}T00:00:00+07:00`)).toISOString())
      .order("transaction_time", { ascending: false })
      .limit(200)
      .then(({ data }) => setEvents((data ?? []) as SoundboxEvent[]))
    const channel = supabase
      .channel(`workspace:${ws}:soundbox`)
      .on("postgres_changes", { schema: "public", table: "soundbox_events", event: "INSERT", filter: `workspace_id=eq.${ws}` }, ({ new: row }) => {
        const e = { ...(row as SoundboxEvent), amount: Number((row as SoundboxEvent).amount) }
        setEvents((list) => (list.some((x) => x.id === e.id) ? list : [e, ...list]))
        setFlash(e)
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setFlash(null), FLASH_MS)
        void announce(e, settings.current.lang, settings.current.soundOn)
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

      <Segmented
        aria-label={t("soundbox.voice")}
        value={lang}
        onChange={(v) => {
          setLang(v)
          keep("soundbox.lang", v)
        }}
        options={[
          { value: "km", label: "🇰🇭 ខ្មែរ" },
          { value: "en", label: "🇬🇧 English" },
        ]}
      />

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
                <span className="min-w-0 flex-1 truncate text-sm">{e.payer ?? e.account_name}</span>
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
          <span className="text-base opacity-90">
            {flash.payer ? `${flash.payer} · ` : ""}
            {flash.account_name} · {hhmm(flash.transaction_time)}
          </span>
        </button>
      )}
    </div>
  )
}
