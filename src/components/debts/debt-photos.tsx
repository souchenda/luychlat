"use client"

import { useQuery } from "@tanstack/react-query"
import { CameraIcon, CrownIcon, ImageIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useDebtMutations, useRepo } from "@/lib/data/hooks"
import type { Debt } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { compressImage } from "@/lib/image"
import { showUpgrade, usePlan } from "@/lib/plan"

const MAX_PHOTOS = 2

function Thumb({ path, onOpen, onRemove }: { path: string; onOpen: (url: string) => void; onRemove: () => void }) {
  const t = useT()
  const { repo } = useRepo()
  const url = useQuery({ queryKey: ["receipt-url", path], staleTime: 10 * 60_000, queryFn: () => repo.getReceiptUrl(path) })
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
      {url.data ? (
        <button type="button" className="size-full" onClick={() => onOpen(url.data!)} aria-label={t("debtPhotos.open")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={url.data} alt="" className="size-full object-cover" />
        </button>
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          {url.isLoading ? <Loader2Icon className="size-5 animate-spin" /> : <ImageIcon className="size-5" />}
        </span>
      )}
      <Button size="icon" variant="secondary" className="absolute top-1.5 right-1.5 size-7 rounded-full" onClick={onRemove} aria-label={t("debtPhotos.remove")}>
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
}

/** Contract / IOU / receipt photos on a debt (PRO, up to two). */
export function DebtPhotos({ debt }: { debt: Debt }) {
  const t = useT()
  const { isPro } = usePlan()
  const { repo } = useRepo()
  const { update } = useDebtMutations(debt.workspace_id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const paths = debt.attachment_paths ?? []

  const add = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return void toast.error(t("debtPhotos.notImage"))
    setBusy(true)
    try {
      const path = await repo.uploadReceipt(await compressImage(file, 1600, 0.8))
      try {
        await update.mutateAsync({ id: debt.id, input: { attachment_paths: [...paths, path].slice(0, MAX_PHOTOS) } })
      } catch (error) {
        await repo.deleteReceipt(path).catch(() => {})
        throw error
      }
      toast.success(t("debtPhotos.added"))
    } catch (error) {
      if (/plan_required/.test(String((error as Error)?.message))) showUpgrade("general")
      else toast.error(t("common.error"))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const remove = async (path: string) => {
    if (!window.confirm(t("debtPhotos.removeConfirm"))) return
    try {
      await update.mutateAsync({ id: debt.id, input: { attachment_paths: paths.filter((p) => p !== path) } })
      await repo.deleteReceipt(path).catch(() => {})
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        {t("debtPhotos.title")}
        {!isPro && <CrownIcon className="size-3.5 text-amber-500" aria-label="PRO" />}
      </h2>
      <Card className="gap-2 px-3 py-3">
        {paths.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {paths.map((p) => (
              <Thumb key={p} path={p} onOpen={setViewing} onRemove={() => void remove(p)} />
            ))}
          </div>
        )}
        {paths.length < MAX_PHOTOS && (
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => (isPro ? fileRef.current?.click() : showUpgrade("general"))}>
            {busy ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
            {t("debtPhotos.add")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t("debtPhotos.hint")}</p>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void add(e.target.files?.[0])} aria-label={t("debtPhotos.add")} />
      </Card>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" onClick={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={viewing} alt={t("debtPhotos.title")} className="max-h-full max-w-full object-contain" />
          <Button size="icon" variant="secondary" className="absolute top-4 right-4 rounded-full" onClick={() => setViewing(null)} aria-label={t("common.close")}>
            <XIcon />
          </Button>
        </div>
      )}
    </section>
  )
}
