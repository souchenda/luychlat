"use client"

import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { cn } from "@/lib/utils"
import { recorderMime, VOICE_FREE_PER_DAY, VOICE_MAX_SECONDS, type VoiceEntryResponse } from "@/lib/voice-entry"

type State = { step: "idle" } | { step: "recording"; seconds: number } | { step: "working" }

/**
 * 🎤 in the entry sheet (founder, 3/11/2026): tap, say «កាហ្វេ 2 ដុល្លារ», tap again (or it stops itself at 30 s) —
 * the words heard come back from /api/voice-entry for the sheet to fill. The microphone is open only while recording.
 */
export function VoiceEntryButton({ onHeard }: { onHeard: (r: { heard: string; text: string }) => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [state, setState] = useState<State>({ step: "idle" })
  const recorder = useRef<MediaRecorder | null>(null)
  const started = useRef(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTracks = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    recorder.current?.stream.getTracks().forEach((track) => track.stop())
  }
  // Closing the sheet mid-recording never leaves the microphone on.
  useEffect(() => () => {
    const rec = recorder.current
    if (rec?.state === "recording") {
      rec.onstop = null
      rec.stop()
    }
    stopTracks()
  }, [])

  const send = async (blob: Blob, seconds: number) => {
    setState({ step: "working" })
    try {
      const body = new FormData()
      body.append("audio", new File([blob], "voice", { type: blob.type || "audio/webm" }))
      body.append("lang", locale)
      body.append("seconds", String(Math.round(seconds)))
      const res = await fetch("/api/voice-entry", { method: "POST", body }).catch(() => null)
      const answer = (await res?.json().catch(() => null)) as VoiceEntryResponse | null
      if (answer && "text" in answer) onHeard(answer)
      else if (answer?.error === "unsure") toast.error(t("voice.unsure", { text: answer.heard ?? "" }))
      else if (answer?.error === "busy") toast.error(t("voice.busy"))
      else if (answer?.error === "limit") toast.error(t("voice.limit", { n: VOICE_FREE_PER_DAY }))
      else toast.error(t("voice.failed"))
    } finally {
      setState({ step: "idle" })
    }
  }

  const start = async () => {
    const mime = typeof MediaRecorder === "undefined" ? null : recorderMime((m) => MediaRecorder.isTypeSupported(m))
    if (!mime || !navigator.mediaDevices?.getUserMedia) return toast.error(t("voice.noMic"))
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      return toast.error(t("voice.noMic"))
    }
    const rec = new MediaRecorder(stream, { mimeType: mime })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      stopTracks()
      const seconds = (Date.now() - started.current) / 1000
      void send(new Blob(chunks, { type: mime.split(";")[0] }), seconds)
    }
    recorder.current = rec
    started.current = Date.now()
    rec.start()
    setState({ step: "recording", seconds: 0 })
    timer.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - started.current) / 1000)
      if (seconds >= VOICE_MAX_SECONDS) rec.stop()
      else setState({ step: "recording", seconds })
    }, 250)
  }

  const recording = state.step === "recording"
  return (
    <button
      type="button"
      onClick={() => (recording ? recorder.current?.stop() : start())}
      disabled={state.step === "working"}
      aria-pressed={recording}
      className={cn(
        "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-70",
        recording
          ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-emerald-500/30 bg-emerald-500/8 text-emerald-800 hover:bg-emerald-500/12 dark:text-emerald-200",
      )}
    >
      {state.step === "working" ? (
        <Loader2Icon className="size-5 animate-spin" aria-hidden />
      ) : recording ? (
        <SquareIcon className="size-4 fill-current" aria-hidden />
      ) : (
        <MicIcon className="size-5" aria-hidden />
      )}
      {state.step === "working" ? t("voice.working") : recording ? `${t("voice.listening")} · 0:${String(state.seconds).padStart(2, "0")}` : t("voice.button")}
    </button>
  )
}
