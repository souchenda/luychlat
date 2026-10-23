"use client"

/**
 * The payment chime and the Khmer clips through Web Audio, unlocked by the first tap (founder, 23/10/2026 — Task #483:
 * an iPhone, screen on, heard nothing). iOS Safari refuses `new Audio(url).play()` started by a payment arriving (no tap
 * behind it) — and an iPhone has no Khmer voice, so the clips were the only voice. One AudioContext is unlocked on the
 * first touch anywhere in the app (a 1-sample silent buffer, inside the tap); afterwards a payment plays its sounds
 * through it, back to back, without a tap. On iOS, Web Audio follows the Silent switch — the app respects the phone's
 * Silent mode (Task #476). Not the SoundBox page's player (lib/soundbox-audio.ts — golden 6 keeps that one apart).
 */
let ctx: AudioContext | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()

const AudioCtx = () =>
  typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)

/** Inside a tap: the context created / resumed and a 1-sample silent buffer played — iOS then lets it play later. */
export function unlockPaymentAudio(): void {
  const Ctx = AudioCtx()
  if (!Ctx) return
  try {
    ctx ??= new Ctx()
    if (ctx.state === "suspended") void ctx.resume().catch(() => null)
    const silent = ctx.createBuffer(1, 1, 22_050)
    const source = ctx.createBufferSource()
    source.buffer = silent
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // no Web Audio here: the HTML audio fallback stays
  }
}

/** The first taps after a launch unlock it (until it runs); returns the unsubscribe. */
export function unlockOnFirstTap(): () => void {
  if (typeof window === "undefined") return () => {}
  const events = ["touchend", "pointerdown", "keydown"] as const
  const off = () => events.forEach((e) => window.removeEventListener(e, onTap, true))
  function onTap() {
    unlockPaymentAudio()
    if (ctx?.state === "running") off()
  }
  events.forEach((e) => window.addEventListener(e, onTap, true))
  return off
}

/** Whether a tap has unlocked the sound (for the log). */
export const paymentAudioUnlocked = () => ctx?.state === "running"

function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url)
  if (!p) {
    const audio = ctx
    p = audio
      ? fetch(url, { cache: "force-cache" })
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((data) => audio.decodeAudioData(data))
          .catch((e: unknown) => {
            console.error(`[SoundBox] clip failed to load: ${url} — ${(e as Error)?.message ?? e}`)
            buffers.delete(url) // tried again next time
            return null
          })
      : Promise.resolve(null)
    buffers.set(url, p)
  }
  return p
}

/**
 * The sounds back to back on the unlocked context; resolves when they have played. False — nothing played — when no
 * tap has unlocked it yet or a file is missing: the caller then tries HTML audio as before.
 */
export async function playThroughWebAudio(urls: string[]): Promise<boolean> {
  if (!ctx) return false
  if (ctx.state === "suspended") await ctx.resume().catch(() => null)
  if (ctx.state !== "running") return false
  const decoded = await Promise.all(urls.map(load))
  if (decoded.some((b) => !b)) return false
  let at = ctx.currentTime + 0.05
  for (const buffer of decoded as AudioBuffer[]) {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(at)
    at += buffer.duration
  }
  const ms = (at - ctx.currentTime) * 1000 + 100
  await new Promise((resolve) => setTimeout(resolve, ms))
  return true
}
