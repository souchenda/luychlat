"use client"

import { MoonIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { create } from "zustand"

import { afterTrack, neighbour, type AudioKind, type Track } from "@/lib/audio-queue"
import { useT } from "@/lib/i18n/use-t"
import { SURAHS } from "@/lib/quran"
import { clock, QURAN_RECITER, quranAudioUrl, SLEEP_MINUTES, sleepAfter, sleepDue, type SleepTimer } from "@/lib/quran-audio"
import { cn } from "@/lib/utils"

type PlayerState = { kind: AudioKind | null; queue: Track[]; index: number; playing: boolean; position: number; duration: number; sleep: SleepTimer; loading: boolean }

/**
 * The app's one audio player (founder, 18/10/2026): the Quran recitation and the cleared Qasidah / Nasheed
 * recordings — never two at once. Streamed, nothing kept on our server.
 */
export const useAudioPlayer = create<PlayerState>(() => ({ kind: null, queue: [], index: 0, playing: false, position: 0, duration: 0, sleep: null, loading: false }))

let audio: HTMLAudioElement | null = null

function element(): HTMLAudioElement {
  if (audio) return audio
  const a = new Audio()
  a.preload = "metadata"
  const set = useAudioPlayer.setState
  a.addEventListener("play", () => set({ playing: true }))
  a.addEventListener("pause", () => set({ playing: false }))
  a.addEventListener("waiting", () => set({ loading: true }))
  a.addEventListener("playing", () => set({ loading: false }))
  a.addEventListener("loadedmetadata", () => set({ duration: a.duration }))
  a.addEventListener("timeupdate", () => {
    set({ position: a.currentTime })
    // The sleep timer (minutes): stop softly when it runs out.
    if (sleepDue(useAudioPlayer.getState().sleep, Date.now())) {
      a.pause()
      set({ sleep: null })
    }
  })
  a.addEventListener("ended", () => {
    const { index, queue, sleep } = useAudioPlayer.getState()
    const next = afterTrack(index, queue.length, sleep)
    if (next !== null) void playAt(next)
    else set({ playing: false, sleep: null })
  })
  a.addEventListener("error", () => set({ playing: false, loading: false }))
  audio = a
  return a
}

/** Lock screen, car Bluetooth and headphones (Media Session): the title, the artist and the buttons. */
function mediaSession(track: Track, kind: AudioKind) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.arabic ? `${track.title} (${track.arabic})` : track.title,
    artist: track.subtitle,
    album: kind === "quran" ? "القرآن الكريم · App Luy Chlat" : "قصائد وأناشيد · App Luy Chlat",
    artwork: [{ src: "/logo.png", sizes: "256x256", type: "image/png" }],
  })
  const a = element()
  const step = (s: -1 | 1) => () => {
    const { index, queue } = useAudioPlayer.getState()
    const n = neighbour(index, queue.length, s)
    if (n !== null) void playAt(n)
  }
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => void a.play()],
    ["pause", () => a.pause()],
    ["previoustrack", step(-1)],
    ["nexttrack", step(1)],
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

/** Play the queue's track `index`. */
async function playAt(index: number) {
  const { queue, kind } = useAudioPlayer.getState()
  const track = queue[index]
  if (!track || !kind) return
  const a = element()
  useAudioPlayer.setState({ index, position: 0, duration: 0, loading: true })
  a.src = track.src
  mediaSession(track, kind)
  await a.play().catch(() => useAudioPlayer.setState({ playing: false, loading: false }))
}

/** ▶️ on a track: play it from this queue — or pause / resume it if it is the one loaded. */
export async function playTrack(kind: AudioKind, queue: Track[], index: number) {
  const a = element()
  const state = useAudioPlayer.getState()
  if (state.kind === kind && state.queue[state.index]?.key === queue[index]?.key && a.src) {
    if (a.paused) await a.play().catch(() => null)
    else a.pause()
    return
  }
  useAudioPlayer.setState({ kind, queue })
  await playAt(index)
}

function stop() {
  audio?.pause()
  if (audio) audio.removeAttribute("src")
  audio?.load()
  useAudioPlayer.setState({ kind: null, queue: [], index: 0, playing: false, position: 0, duration: 0, sleep: null, loading: false })
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.metadata = null
}

/** The 114 surahs as a queue, recited by Mishary Alafasy (MP3Quran's official CDN). */
const quranQueue = (): Track[] =>
  SURAHS.map((s) => ({ key: `quran:${s.n}`, title: `${s.n}. ${s.latin}`, subtitle: QURAN_RECITER.name, arabic: s.ar, src: quranAudioUrl(s.n) }))

/** The compact floating bar above the bottom menu while something is loaded. */
export function AudioMiniPlayer() {
  const t = useT()
  const { kind, queue, index, playing, position, duration, sleep, loading } = useAudioPlayer()
  const [timerOpen, setTimerOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sleep?.kind !== "minutes") return
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [sleep])
  const track = queue[index]
  if (!kind || !track) return null
  const left = sleep?.kind === "minutes" ? Math.max(1, Math.ceil((sleep.until - now) / 60_000)) : null
  const prev = neighbour(index, queue.length, -1)
  const next = neighbour(index, queue.length, 1)
  const iconButton = "grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"

  return (
    <>
      {/* Room at the end of the page, so the bar never covers its last lines. */}
      <div className="h-28 print:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-3 print:hidden md:mx-auto md:max-w-md">
        <div className="rounded-2xl border bg-background/95 px-3 pt-2.5 pb-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1 pl-1">
              <p className="flex items-baseline gap-1.5 truncate text-sm font-semibold">
                <span className="truncate">{track.title}</span>
                {track.arabic && (
                  <span dir="rtl" lang="ar" className="font-quran text-base font-normal">
                    {track.arabic}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {track.subtitle}
                {loading ? ` · ${t("quranAudio.loading")}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => setTimerOpen((v) => !v)} aria-label={t("quranAudio.sleep")} aria-expanded={timerOpen} className={cn(iconButton, sleep && "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300")}>
              <MoonIcon className="size-5" />
            </button>
            <button type="button" onClick={stop} aria-label={t("common.close")} className={iconButton}>
              <XIcon className="size-5" />
            </button>
          </div>
          <div className="mt-1 flex items-center justify-center gap-3">
            <button type="button" disabled={prev === null} onClick={() => prev !== null && void playAt(prev)} aria-label={t("quranAudio.prev")} className={iconButton}>
              <SkipBackIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => void playTrack(kind, queue, index)}
              aria-label={playing ? t("quranAudio.pause") : t("quranAudio.play")}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm active:scale-95"
            >
              {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 translate-x-px" />}
            </button>
            <button type="button" disabled={next === null} onClick={() => next !== null && void playAt(next)} aria-label={t("quranAudio.next")} className={iconButton}>
              <SkipForwardIcon className="size-5" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
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
          {sleep && (
            <p className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-300">
              🌙 {left ? t("quranAudio.sleepLeft", { n: left }) : t(kind === "quran" ? "quranAudio.sleepSurahOn" : "quranAudio.sleepTrackOn")}
            </p>
          )}
          {timerOpen && (
            <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={t("quranAudio.sleep")}>
              {SLEEP_MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    useAudioPlayer.setState({ sleep: sleepAfter(m, Date.now()) })
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
                  useAudioPlayer.setState({ sleep: sleep?.kind === "surah" ? null : { kind: "surah" } })
                  setTimerOpen(false)
                }}
                className="min-h-11 rounded-xl border px-1 text-xs font-medium hover:bg-muted"
              >
                {t(kind === "quran" ? "quranAudio.sleepSurah" : "quranAudio.sleepTrack")}
              </button>
              {sleep && (
                <button type="button" onClick={() => useAudioPlayer.setState({ sleep: null })} className="col-span-4 min-h-9 rounded-xl text-xs text-muted-foreground hover:bg-muted">
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

/** ▶️ / ⏸ on a row: a surah (`surah`), or a track of a given queue. */
export function PlayButton({ kind, queue, index, className }: { kind: AudioKind; queue: () => Track[]; index: number; className?: string }) {
  const t = useT()
  const loaded = useAudioPlayer((s) => (s.kind === kind ? s.queue[s.index]?.key : null))
  const playing = useAudioPlayer((s) => s.playing)
  const key = `${kind}:${index}`
  const mine = loaded !== null && loaded !== undefined && (kind === "quran" ? loaded === `quran:${index + 1}` : loaded === queue()[index]?.key)
  const on = mine && playing
  return (
    <button
      type="button"
      data-key={key}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void playTrack(kind, queue(), index)
      }}
      aria-label={on ? t("quranAudio.pause") : t("quranAudio.play")}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full", on ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300", className)}
    >
      {on ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 translate-x-px" />}
    </button>
  )
}

/** ▶️ on a surah row (the Quran reader's list). */
export function SurahPlayButton({ surah, className }: { surah: number; className?: string }) {
  return <PlayButton kind="quran" queue={quranQueue} index={surah - 1} className={className} />
}

