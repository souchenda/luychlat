"use client"

import { CameraIcon, Loader2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { useT } from "@/lib/i18n/use-t"
import { compressImage, MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import type { ScanKind } from "@/lib/scan"
import { cn } from "@/lib/utils"

/**
 * «📷 ថតរូប ឬស្កេនឯកសារ» — the one camera-first bar at the top of the creation forms: one tap opens the
 * camera or the photo library; the photo (upright, compressed on the phone) is read and `onRead`
 * fills the form, which the person reviews before saving. `onFile` replaces the reading for a form
 * with its own reader (the bill form).
 */
export function CameraScanBar<T>({
  kind,
  onRead,
  onFile,
  hint,
  busy: busyOuter,
  className,
}: {
  kind?: ScanKind
  onRead?: (read: T) => void
  onFile?: (file: File) => Promise<void>
  hint?: string
  busy?: boolean
  className?: string
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const working = busy || Boolean(busyOuter)

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_RECEIPT_INPUT_BYTES || !file.type.startsWith("image/")) return void toast.error(t("scan.invalid"))
    setBusy(true)
    try {
      if (onFile) return await onFile(file)
      if (!kind || !onRead) return
      const body = new FormData()
      body.append("image", await compressImage(file, 1800, 0.9), "scan.jpg")
      body.append("kind", kind)
      const res = await fetch("/api/scan", { method: "POST", body }).catch(() => null)
      const json = (await res?.json().catch(() => null)) as { read?: T; error?: string } | null
      if (json?.read) {
        onRead(json.read)
        toast.success(t("scan.filled"))
      } else toast.error(t(json?.error === "unreadable" ? "scan.unreadable" : "scan.busy"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <button
        type="button"
        disabled={working}
        onClick={() => input.current?.click()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-70"
      >
        {working ? <Loader2Icon className="size-4 animate-spin" /> : <CameraIcon className="size-4" />}
        {working ? t("scan.reading") : t("scan.button")}
      </button>
      <p className="text-center text-[11px] text-muted-foreground">{hint ?? t("scan.hint")}</p>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  )
}
