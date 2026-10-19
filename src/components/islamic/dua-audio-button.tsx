"use client"

import { PauseIcon, Repeat2Icon, Volume2Icon } from "lucide-react"
import { useEffect, useRef } from "react"
import { create } from "zustand"

import { Button } from "@/components/ui/button"
import { duaAudioReducer, duaAudioSrc, type DuaAudioEvent, type DuaAudioState } from "@/lib/dua-audio"
import { useKhmerT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/** One player for every du'a card — another du'a stops the one playing (lib/dua-audio.ts). */
const useDuaAudio = create<DuaAudioState & { send: (e: DuaAudioEvent) => void }>((set, get) => ({
  playing: null,
  repeat: false,
  send: (e) => set(duaAudioReducer(get(), e)),
}))

let audio: HTMLAudioElement | null = null
function element() {
  if (!audio) {
    audio = new Audio()
    audio.preload = "none"
    audio.addEventListener("ended", () => {
      useDuaAudio.getState().send({ type: "ended" })
      if (useDuaAudio.getState().playing && audio) {
        audio.currentTime = 0
        void audio.play().catch(() => useDuaAudio.getState().send({ type: "stop" }))
      }
    })
  }
  return audio
}

/** 🔊 / ⏸ beside the du'a's copy button, and «🔁 ទន្ទេញ» while it plays — only for a du'a with a cleared recording. */
export function DuaAudioButton({ id }: { id: string }) {
  const t = useKhmerT()
  const src = duaAudioSrc(id)
  const { playing, repeat, send } = useDuaAudio()
  const mine = playing === id
  const started = useRef(false)

  // The store decides; the one audio element follows it.
  useEffect(() => {
    if (!src) return
    const a = element()
    if (mine) {
      if (!a.src.endsWith(src)) {
        a.src = src
        a.currentTime = 0
      }
      started.current = true
      void a.play().catch(() => send({ type: "stop" }))
    } else if (started.current && a.src.endsWith(src)) {
      a.pause()
      started.current = false
    }
  }, [mine, src, send])

  if (!src) return null
  return (
    <>
      {mine && (
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-8 gap-1 px-2 text-xs", repeat ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}
          aria-pressed={repeat}
          onClick={() => send({ type: "repeat" })}
        >
          <Repeat2Icon className="size-4" aria-hidden />
          {t("duas.memorise")}
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className={cn("size-8 text-muted-foreground", mine && "animate-pulse text-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.45)]")}
        onClick={() => send({ type: "toggle", id })}
        aria-label={mine ? t("duas.pause") : t("duas.listen")}
      >
        {mine ? <PauseIcon /> : <Volume2Icon />}
      </Button>
    </>
  )
}
