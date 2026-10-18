"use client"

import { MoonIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { create } from "zustand"

import { useT } from "@/lib/i18n/use-t"
import { afterSurah, clock, QURAN_RECITER, quranAudioUrl, SLEEP_MINUTES, sleepAfter, sleepDue, type SleepTimer } from "@/lib/quran-audio"
import { surahByNumber } from "@/lib/quran"
import { cn } from "@/lib/utils"

type PlayerState = { surah: number | null; playing: boolean; position: number; duration: number; sleep: SleepTimer; loading: boolean }

/** The one Quran player of the app (any page): what plays, where it is, and the sleep timer. */
export const useQuranPlayer = create<PlayerState>(() => ({ surah: null, playing: false, position: 0, duration: 0, sleep: null, loading: false }))

let audio: HTMLAudioElement | null = null

/** The audio element, made once with its events (streamed — nothing is downloaded to keep). */
function element(): HTMLAudioElement {
  if (audio) return audio
  const a = new Audio()
  a.preload = "metadata"
  const set = useQuranPlayer.setState
  a.addEventListener("play", () => set({ playing: true }))
  a.addEventListener("pause", () => set({ playing: false }))
  a.addEventListener("waiting", () => set({ loading: true }))
  a.addEventListener("playing", () => set({ loading: false }))
  a.addEventListener("loadedmetadata", () => set({ duration: a.duration }))
  a.addEventListener("timeupdate", () => {
    set({ position: a.currentTime })
    // The sleep timer (minutes): stop softly when it runs out.
    if (sleepDue(useQuranPlayer.getState().sleep, Date.now())) {
      a.pause()
      set({ sleep: null })
    }
  })
  a.addEventListener("ended", () => {
    const { surah, sleep } = useQuranPlayer.getState()
    const next = surah ? afterSurah(surah, sleep) : null
    if (next) void playSurah(next)
    else set({ playing: false, sleep: null })
  })
  a.addEventListener("error", () => set({ playing: false, loading: false }))
  audio = a
  return a
}

/** Lock screen, car Bluetooth and headphones: what is playing and the buttons (Media Session). */
function mediaSession(surah: number) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
  const s = surahByNumber(surah)
  navigator.mediaSession.metadata = new MediaMetadata({
    title: s ? `${s.n}. ${s.latin} (${s.ar})` : `Surah ${surah}`,
    artist: QURAN_RECITER.name,
    album: "القرآن الكريم · App Luy Chlat",
    artwork: [{ src: "/logo.png", sizes: "256x256", type: "image/png" }],
  })
  const a = element()
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => void a.play()],
    ["pause", () => a.pause()],
    ["previoustrack", () => surah > 1 && void playSurah(surah - 1)],
    ["nexttrack", () => surah < 114 && void playSurah(surah + 1)],
    ["seekto", (d) => d.seekTime !== undefined && (a.currentTime = d.seekTime)],
    ["seekbackward", () => (a.currentTime = Math.max(0, a.currentTime - 10))],
    ["seekforward", () => (a.currentTime = Math.min(a.duration || a.currentTime, a.currentTime + 10))],
  ]
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      // an action this browser doesn't support
    }
  }
}

/** ▶️ on a surah: play it (or pause / resume it if it is the one playing). */
export async function playSurah(surah: number) {
  const a = element()
  const state = useQuranPlayer.getState()
  if (state.surah === surah && a.src) {
    if (a.paused) await a.play().catch(() => null)
    else a.pause()
    return
  }
  useQuranPlayer.setState({ surah, position: 0, duration: 0, loading: true })
  a.src = quranAudioUrl(surah)
  mediaSession(surah)
  await a.play().catch(() => useQuranPlayer.setState({ playing: false, loading: false }))
}

function stop() {
  audio?.pause()
  if (audio) audio.removeAttribute("src")
  audio?.load()
  useQuranPlayer.setState({ surah: null, playing: false, position: 0, duration: 0, sleep: null, loading: false })
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.metadata = null
}

/** The compact floating bar above the bottom menu while a surah is loaded: title, reciter, ▶︎/⏸, scrubber, sleep timer. */
export function QuranMiniPlayer() {
  const t = useT()
  const { surah, playing, position, duration, sleep, loading } = useQuranPlayer()
  const [timerOpen, setTimerOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sleep?.kind !== "minutes") return
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [sleep])
  if (!surah) return null
  const s = surahByNumber(surah)
  const left = sleep?.kind === "minutes" ? Math.max(1, Math.ceil((sleep.until - now) / 60_000)) : null

  return (
    <>
    {/* Room at the end of the page, so the bar never covers its last lines. */}
    <div className="h-28 print:hidden" aria-hidden />
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-3 print:hidden md:mx-auto md:max-w-md">
      <div className="rounded-2xl border bg-background/95 px-3 pt-2.5 pb-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void playSurah(surah)}
            aria-label={playing ? t("quranAudio.pause") : t("quranAudio.play")}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm active:scale-95"
          >
            {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 translate-x-px" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5 truncate text-sm font-semibold">
              <span className="truncate">
                {surah}. {s?.latin}
              </span>
              <span dir="rtl" lang="ar" className="font-quran text-base font-normal">
                {s?.ar}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {QURAN_RECITER.name}
              {loading ? ` · ${t("quranAudio.loading")}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTimerOpen((v) => !v)}
            aria-label={t("quranAudio.sleep")}
            aria-expanded={timerOpen}
            className={cn("grid size-11 shrink-0 place-items-center rounded-full", sleep ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "text-muted-foreground hover:bg-muted")}
          >
            <MoonIcon className="size-5" />
          </button>
          <button type="button" onClick={stop} aria-label={t("common.close")} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <span>{clock(position)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={1}
            value={Math.min(position, duration || 0)}
            onChange={(e) => {
              if (audio) audio.currentTime = Number(e.target.value)
            }}
            aria-label={t("quranAudio.seek")}
            className="h-1.5 flex-1 accent-emerald-600"
          />
          <span>{clock(duration)}</span>
        </div>
        {sleep && <p className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-300">🌙 {left ? t("quranAudio.sleepLeft", { n: left }) : t("quranAudio.sleepSurahOn")}</p>}
        {timerOpen && (
          <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={t("quranAudio.sleep")}>
            {SLEEP_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  useQuranPlayer.setState({ sleep: sleepAfter(m, Date.now()) })
                  setNow(Date.now())
                  setTimerOpen(false)
                }}
                className="min-h-11 rounded-xl border px-1 text-xs font-medium hover:bg-muted"
              >
                {t("quranAudio.sleepMinutes", { n: m })}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                useQuranPlayer.setState({ sleep: sleep?.kind === "surah" ? null : { kind: "surah" } })
                setTimerOpen(false)
              }}
              className="min-h-11 rounded-xl border px-1 text-xs font-medium hover:bg-muted"
            >
              {t("quranAudio.sleepSurah")}
            </button>
            {sleep && (
              <button type="button" onClick={() => useQuranPlayer.setState({ sleep: null })} className="col-span-4 min-h-9 rounded-xl text-xs text-muted-foreground hover:bg-muted">
                {t("quranAudio.sleepOff")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

/** ▶️ / ⏸ on a surah row. */
export function SurahPlayButton({ surah, className }: { surah: number; className?: string }) {
  const t = useT()
  const current = useQuranPlayer((s) => s.surah)
  const playing = useQuranPlayer((s) => s.playing)
  const on = current === surah && playing
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void playSurah(surah)
      }}
      aria-label={on ? t("quranAudio.pause") : t("quranAudio.play")}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full", on ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300", className)}
    >
      {on ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 translate-x-px" />}
    </button>
  )
}
