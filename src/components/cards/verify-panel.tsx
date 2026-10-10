"use client"

import { CircleHelpIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"

import { CardLightbox, type CardSide, type LightboxCard } from "@/components/cards/card-lightbox"
import { useT } from "@/lib/i18n/use-t"
import { useCardPhotoUrl, type CardBucket } from "@/lib/id-cards"

/** The warning on every card form: what is saved must match the physical card exactly. */
export function VerifyBanner({ uncertain }: { uncertain: boolean }) {
  const t = useT()
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm font-medium text-amber-900 dark:text-amber-200">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("cards.verifyWarning")}
      </p>
      {uncertain && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-900 dark:text-rose-200">
          <CircleHelpIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("cards.uncertain")}
        </p>
      )}
    </div>
  )
}

/** «មិនទាន់ផ្ទៀងផ្ទាត់» beside a card the user hasn't confirmed against the physical card. */
export function UnverifiedMark() {
  const t = useT()
  return <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-400">{t("cards.unverified")}</span>
}

/**
 * The cropped card shown large right above the fields read from it, so every letter can be checked
 * against it; tap to open it full screen and zoom.
 */
export function CardCheckPhoto({ bucket, front, back, title }: { bucket: CardBucket; front: string | null; back: string | null; title: string }) {
  const t = useT()
  const url = useCardPhotoUrl(bucket, front ?? back).data
  const [side, setSide] = useState<CardSide | null>(null)
  if (!front && !back) return null
  const card: LightboxCard = { id: `check-${front ?? back}`, title, number: null, bucket, front, back, qrText: null }
  return (
    <>
      <button type="button" onClick={() => setSide(front ? "FRONT" : "BACK")} className="block w-full overflow-hidden rounded-xl border bg-muted" aria-label={t("cards.checkPhoto")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        {url ? <img src={url} alt={title} className="aspect-[1.585] w-full object-contain" /> : <span className="block aspect-[1.585] w-full animate-pulse" />}
      </button>
      <p className="-mt-2 text-center text-[11px] text-muted-foreground">{t("cards.checkPhotoHint")}</p>
      {side && <CardLightbox card={card} side={side} onSide={setSide} onClose={() => setSide(null)} onQrFound={() => {}} />}
    </>
  )
}
