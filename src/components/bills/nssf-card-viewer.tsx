"use client"

import { Loader2Icon, XIcon } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { signedPhotoUrl, useNssfPhotoUrl, type NssfMember } from "@/lib/bills"
import { useT } from "@/lib/i18n/use-t"
import { decodeQrText } from "@/lib/khqr-decode"

export type CardSide = "FRONT" | "BACK" | "QR"

/** The card's QR redrawn large on white, from its text — crisp for a scanner, unlike a photo of it. */
function QrPanel({ member, onQrFound }: { member: NssfMember; onQrFound: (text: string) => void }) {
  const t = useT()
  const [image, setImage] = useState<string | null>(null)
  const [state, setState] = useState<"reading" | "none" | "ok">(member.qr_text ? "ok" : "reading")

  useEffect(() => {
    let live = true
    void (async () => {
      let text = member.qr_text ?? null
      // Not read yet (older cards): look for it in the stored photos, on this phone.
      if (!text) {
        for (const path of [member.front_path, member.back_path]) {
          if (!path || text) continue
          const url = await signedPhotoUrl(path)
          const res = url ? await fetch(url, { cache: "no-store" }).catch(() => null) : null
          if (res?.ok) text = await decodeQrText(await res.blob()).catch(() => null)
        }
        if (text) onQrFound(text)
      }
      if (!live) return
      if (!text) return setState("none")
      setImage(await QRCode.toDataURL(text, { width: 720, margin: 2, errorCorrectionLevel: "M" }))
      setState("ok")
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per member
  }, [member.id, member.qr_text])

  if (state === "none") return <p className="px-6 text-center text-sm text-white/80">{t("nssf.qrNone")}</p>
  if (!image) return <Loader2Icon className="size-6 animate-spin text-white/70" />
  return (
    <div className="flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={image} alt="QR" className="aspect-square w-[min(82vw,60dvh)] rounded-2xl bg-white p-3" />
      <p className="px-6 text-center text-sm text-white/90">{t("nssf.qrShowStaff")}</p>
    </div>
  )
}

function Side({ path, label }: { path: string; label: string }) {
  const url = useNssfPhotoUrl(path).data
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  return url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : <Loader2Icon className="size-6 animate-spin text-white/70" />
}

/**
 * Full-screen card: the original photos (front with the photo and stamp, back) at full size, and the
 * card's QR redrawn for hospital staff to scan from the phone.
 */
export function NssfCardViewer({ member, side, onSide, onClose, onQrFound }: { member: NssfMember; side: CardSide; onSide: (s: CardSide) => void; onClose: () => void; onQrFound: (text: string) => void }) {
  const t = useT()
  const options = [
    ...(member.front_path ? [{ value: "FRONT" as const, label: t("nssf.sideFront") }] : []),
    ...(member.back_path ? [{ value: "BACK" as const, label: t("nssf.sideBack") }] : []),
    { value: "QR" as const, label: "QR" },
  ]
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="flex h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none border-0 bg-black p-3 sm:max-w-none">
        <DialogTitle className="sr-only">{member.name}</DialogTitle>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-white">
            <p className="truncate text-base font-semibold">{member.name}</p>
            {member.nssf_id && <p className="font-mono text-sm tracking-wide text-white/80">{member.nssf_id}</p>}
          </div>
          <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label={t("common.close")} onClick={onClose}>
            <XIcon />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {side === "FRONT" && member.front_path ? (
            <Side path={member.front_path} label={t("nssf.sideFront")} />
          ) : side === "BACK" && member.back_path ? (
            <Side path={member.back_path} label={t("nssf.sideBack")} />
          ) : (
            <QrPanel member={member} onQrFound={onQrFound} />
          )}
        </div>
        <Segmented aria-label={t("nssf.vaultTitle")} value={side} onChange={onSide} options={options} className="mx-auto w-full max-w-sm" />
      </DialogContent>
    </Dialog>
  )
}
