"use client"

import { CameraIcon, Loader2Icon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useReceiptUrl } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { compressImage } from "@/lib/image"

/** Saved receipt reference, a newly picked (compressed) image, or nothing. */
export type ReceiptValue = { kind: "none" } | { kind: "saved"; ref: string } | { kind: "new"; blob: Blob }

export function ReceiptField({ value, onChange }: { value: ReceiptValue; onChange: (value: ReceiptValue) => void }) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(false)
  const savedUrl = useReceiptUrl(value.kind === "saved" ? value.ref : null)
  const [newUrl, setNewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (value.kind !== "new") return setNewUrl(null)
    const url = URL.createObjectURL(value.blob)
    setNewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange({ kind: "new", blob: await compressImage(file) })
    } catch {
      toast.error(t("entry.receiptError"))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const preview = value.kind === "new" ? newUrl : value.kind === "saved" ? savedUrl : null

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {value.kind === "none" ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/50"
        >
          {busy ? <Loader2Icon className="size-5 animate-spin" /> : <CameraIcon className="size-5" />}
          {t("entry.addReceipt")}
        </button>
      ) : (
        <div className="relative inline-block">
          <button type="button" onClick={() => setZoom(true)} className="block overflow-hidden rounded-xl border">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob/signed URLs, not optimisable
              <img src={preview} alt={t("entry.receipt")} className="h-24 w-24 object-cover" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onChange({ kind: "none" })}
            className="absolute -top-2 -right-2 rounded-full bg-foreground p-1 text-background shadow"
            aria-label={t("entry.removeReceipt")}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-lg">
          <DialogTitle className="sr-only">{t("entry.receipt")}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob/signed URLs, not optimisable */}
          {preview && <img src={preview} alt={t("entry.receipt")} className="max-h-[80dvh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
