"use client"

import { Loader2Icon, SunIcon, XIcon } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"

import { ZoomableImage } from "@/components/cards/zoomable-image"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { decodeCardCode } from "@/lib/card-code"
import { useT } from "@/lib/i18n/use-t"
import { signedCardUrl, useCardPhotoUrl, type CardBucket } from "@/lib/id-cards"
import { cn } from "@/lib/utils"

export type CardSide = "FRONT" | "BACK" | "QR"

export type LightboxCard = {
  id: string
  title: string
  number: string | null
  bucket: CardBucket
  front: string | null
  back: string | null
  qrText: string | null
}

/** Keeps the screen on while the code is shown (the browser can't raise the brightness itself). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }
    void nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => null)
    return () => void lock?.release().catch(() => null)
  }, [on])
}

/** The card's code redrawn large, black on white — crisp for a scanner, unlike a photo of it. */
function CodePanel({ card, bright, onQrFound }: { card: LightboxCard; bright: boolean; onQrFound: (text: string) => void }) {
  const t = useT()
  const [image, setImage] = useState<string | null>(null)
  const [none, setNone] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      let text = card.qrText
      // Not read yet (older cards): looked for in the stored photos, on this phone.
      if (!text) {
        for (const path of [card.front, card.back]) {
          if (!path || text) continue
          const url = await signedCardUrl(card.bucket, path)
          const res = url ? await fetch(url, { cache: "no-store" }).catch(() => null) : null
          if (res?.ok) text = await decodeCardCode(await res.blob())
        }
        if (text) onQrFound(text)
      }
      if (!live) return
      if (!text) return setNone(true)
      setImage(await QRCode.toDataURL(text, { width: 900, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }))
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per card
  }, [card.id, card.qrText])

  if (none) return <p className={cn("px-6 text-center text-sm", bright ? "text-black/70" : "text-white/80")}>{t("cards.qrNone")}</p>
  if (!image) return <Loader2Icon className={cn("size-6 animate-spin", bright ? "text-black/50" : "text-white/70")} />
  return (
    <div className="flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={image} alt="QR" className="aspect-square w-[min(88vw,62dvh)] bg-white" style={{ imageRendering: "pixelated" }} />
      <p className={cn("px-6 text-center text-sm font-medium", bright ? "text-black" : "text-white/90")}>{t("cards.qrShowStaff")}</p>
    </div>
  )
}

function Side({ bucket, path, label }: { bucket: CardBucket; path: string; label: string }) {
  const url = useCardPhotoUrl(bucket, path).data
  return url ? <ZoomableImage src={url} alt={label} /> : <Loader2Icon className="size-6 animate-spin text-white/70" />
}

/**
 * Any vault card full screen: the original photos (pinch to zoom, letter by letter) and its QR /
 * barcode redrawn large for a hospital, police or bank scanner. «ពន្លឺខ្លាំង»: a white screen with
 * the code at maximum contrast, kept awake.
 */
export function CardLightbox({ card, side, onSide, onClose, onQrFound }: { card: LightboxCard; side: CardSide; onSide: (s: CardSide) => void; onClose: () => void; onQrFound: (text: string) => void }) {
  const t = useT()
  const [bright, setBright] = useState(false)
  const showingCode = side === "QR"
  useWakeLock(showingCode)
  const light = bright && showingCode
  const options = [
    ...(card.front ? [{ value: "FRONT" as const, label: t("cards.front") }] : []),
    ...(card.back ? [{ value: "BACK" as const, label: t("cards.back") }] : []),
    { value: "QR" as const, label: "QR" },
  ]
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className={cn("flex h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:max-w-none", light ? "bg-white" : "bg-black")}>
        <DialogTitle className="sr-only">{card.title}</DialogTitle>
        <div className="flex items-center gap-2">
          <div className={cn("min-w-0 flex-1", light ? "text-black" : "text-white")}>
            <p className="truncate text-base font-semibold">{card.title}</p>
            {card.number && <p className="font-mono text-sm tracking-wide opacity-80">{card.number}</p>}
          </div>
          {showingCode && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={bright}
              className={cn(light ? "text-black hover:bg-black/5" : "text-white hover:bg-white/10 hover:text-white")}
              onClick={() => setBright((b) => !b)}
            >
              <SunIcon />
              {t("cards.bright")}
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" className={cn(light ? "text-black hover:bg-black/5" : "text-white hover:bg-white/10 hover:text-white")} aria-label={t("common.close")} onClick={onClose}>
            <XIcon />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {side === "FRONT" && card.front ? (
            <Side bucket={card.bucket} path={card.front} label={t("cards.front")} />
          ) : side === "BACK" && card.back ? (
            <Side bucket={card.bucket} path={card.back} label={t("cards.back")} />
          ) : (
            <CodePanel card={card} bright={light} onQrFound={onQrFound} />
          )}
        </div>
        <Segmented aria-label={card.title} value={side} onChange={onSide} options={options} className="mx-auto w-full max-w-sm" />
      </DialogContent>
    </Dialog>
  )
}
