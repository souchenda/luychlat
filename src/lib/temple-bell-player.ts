"use client"

import { BELL_SECONDS, bellSample } from "@/lib/temple-bell"

const FILE = "/audio/holy-day/temple-bell.mp3"

/** The same bell synthesized with Web Audio, where the MP3 can't play. */
async function synthBell() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * BELL_SECONDS), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs((data[i] = bellSample(i / ctx.sampleRate))))
  for (let i = 0; i < data.length; i++) data[i] = (data[i] / peak) * 0.5
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  if (ctx.state === "suspended") await ctx.resume()
  source.start()
  source.onended = () => void ctx.close()
}

/**
 * One soft bell. Phones refuse sound before the person has touched the page: then it rings at the
 * first tap instead (once). A file that can't play falls back to the synthesized bell.
 */
export function playTempleBell() {
  const audio = new Audio(FILE)
  audio.volume = 0.7
  audio.play().catch((e: unknown) => {
    if ((e as { name?: string })?.name === "NotAllowedError") {
      const once = () => {
        window.removeEventListener("pointerdown", once)
        void new Audio(FILE).play().catch(() => synthBell())
      }
      window.addEventListener("pointerdown", once, { once: true })
      return
    }
    void synthBell().catch(() => {})
  })
}
