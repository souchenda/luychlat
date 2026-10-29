"use client"

import { DownloadIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { BIRTHDAY_SHOWN_KEY, BIRTHDAY_TUNE, cambodiaDate, shouldCelebrate } from "@/lib/birthday"
import { useProfile } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { useProfilePrivate } from "@/lib/profile-private"

/** CSS confetti: a few dozen falling pieces (none with reduced motion). */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 12) * 0.18,
        duration: 2.6 + (i % 5) * 0.35,
        color: ["#10b981", "#f59e0b", "#f43f5e", "#14b8a6", "#eab308"][i % 5],
        rotate: (i * 47) % 360,
      })),
    [],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute -top-3 block h-3 w-1.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `birthday-fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
      <style>{`@keyframes birthday-fall { to { transform: translateY(520px) rotate(540deg); opacity: 0.2 } }`}</style>
    </div>
  )
}

/** The jingle, synthesised (no audio file): only when the person turns the sound on. */
function playTune(ctx: AudioContext): () => void {
  const beat = 0.32
  let t = ctx.currentTime + 0.05
  const nodes: OscillatorNode[] = []
  for (const [freq, beats] of BIRTHDAY_TUNE) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "triangle"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + beats * beat * 0.95)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + beats * beat)
    nodes.push(osc)
    t += beats * beat
  }
  return () => nodes.forEach((n) => n.stop())
}

/** Wraps Khmer / English text to a width on a canvas (by words; Khmer without spaces by characters). */
function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const units = text.includes(" ") ? text.split(" ") : [...text]
  const joiner = text.includes(" ") ? " " : ""
  const lines: string[] = []
  let line = ""
  for (const u of units) {
    const next = line ? line + joiner + u : u
    if (c.measureText(next).width > width && line) {
      lines.push(line)
      line = u
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** The shareable card: 1080×1080 PNG — green and gold, the mascot, the wish, the brand. */
async function renderCard(title: string, blessing: string, brand: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1080
  const c = canvas.getContext("2d")
  if (!c) return null
  const g = c.createLinearGradient(0, 0, 1080, 1080)
  g.addColorStop(0, "#065f46")
  g.addColorStop(0.6, "#0f766e")
  g.addColorStop(1, "#b45309")
  c.fillStyle = g
  c.fillRect(0, 0, 1080, 1080)
  const logo = new Image()
  logo.src = "/logo.png"
  await logo.decode().catch(() => null)
  if (logo.naturalWidth) c.drawImage(logo, 390, 110, 300, 300)
  const font = getComputedStyle(document.body).fontFamily
  c.fillStyle = "#ffffff"
  c.textAlign = "center"
  c.font = `700 64px ${font}`
  let y = 520
  for (const l of wrap(c, `${title} 🎂`, 940)) {
    c.fillText(l, 540, y)
    y += 84
  }
  c.font = `400 40px ${font}`
  c.fillStyle = "rgba(255,255,255,0.92)"
  y += 20
  for (const l of wrap(c, blessing, 900)) {
    c.fillText(l, 540, y)
    y += 60
  }
  c.font = `600 34px ${font}`
  c.fillStyle = "#fde68a"
  c.fillText(brand, 540, 1010)
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
}

/**
 * On the person's birthday (Cambodia date), once a year per device: confetti, the mascot, the wish —
 * with an optional jingle (off until tapped) and a card to share.
 */
export function BirthdayCelebrationModal() {
  const t = useT()
  const birthDate = useProfilePrivate().data?.birth_date
  const displayName = useProfile().data?.display_name?.trim()
  const name = displayName && !displayName.startsWith("•") ? displayName : t("bot.birthdayYou")
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(false)
  const audio = useRef<{ ctx: AudioContext; stop: () => void } | null>(null)

  useEffect(() => {
    let shown: string | null = null
    try {
      shown = localStorage.getItem(BIRTHDAY_SHOWN_KEY)
    } catch {}
    if (!shouldCelebrate(birthDate, shown)) return
    setOpen(true)
    try {
      localStorage.setItem(BIRTHDAY_SHOWN_KEY, String(cambodiaDate().year))
    } catch {}
  }, [birthDate])

  const stopSound = () => {
    audio.current?.stop()
    void audio.current?.ctx.close().catch(() => null)
    audio.current = null
  }
  useEffect(() => stopSound, [])

  const toggleSound = () => {
    if (sound) {
      stopSound()
      setSound(false)
      return
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    audio.current = { ctx, stop: playTune(ctx) }
    setSound(true)
  }

  const title = t("birthday.celebrateTitle", { name })
  const blessing = t("birthday.celebrateBody", { name })

  const share = async () => {
    const blob = await renderCard(title, blessing, "អេប លុយឆ្លាត · App Luy Chlat")
    if (!blob) return toast.error(t("common.error"))
    const file = new File([blob], "birthday-luychlat.png", { type: "image/png" })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title }).catch(() => null)
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }

  const close = (next: boolean) => {
    if (next) return
    stopSound()
    setSound(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="overflow-hidden bg-linear-to-b from-emerald-50 via-amber-50 to-rose-50 p-6 text-center dark:from-emerald-950 dark:via-neutral-900 dark:to-neutral-900">
        <Confetti />
        <button
          type="button"
          onClick={toggleSound}
          className="absolute top-2 left-2 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          aria-label={t(sound ? "birthday.soundOff" : "birthday.soundOn")}
          aria-pressed={sound}
        >
          {sound ? <Volume2Icon className="size-5" /> : <VolumeXIcon className="size-5" />}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- the local mascot, a small static file */}
        <img src="/logo.png" alt="" className="mx-auto size-28 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none" />
        <DialogTitle className="text-xl leading-snug font-bold">{title}</DialogTitle>
        <DialogDescription className="text-base leading-relaxed text-neutral-700 dark:text-neutral-200">{blessing}</DialogDescription>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12" onClick={() => close(false)}>
            <XIcon />
            {t("common.close")}
          </Button>
          <Button type="button" className="h-12" onClick={() => void share()}>
            <DownloadIcon />
            {t("birthday.shareCard")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
