"use client"

import { Loader2Icon, PlusIcon, QrCodeIcon, StarIcon, Trash2Icon } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/i18n/use-t"
import type { KhqrBank } from "@/lib/khqr"
import { BANK_LOOK, codeLabel, type KhqrCode } from "@/lib/khqr-codes"
import { useKhqrCodeMutations, useKhqrImageUrl, useWorkspaceKhqrs } from "@/lib/khqr-codes-data"

/** The code itself, small: the uploaded screenshot when there is one, else redrawn from its payload. */
function Thumb({ code }: { code: KhqrCode }) {
  const url = useKhqrImageUrl(code.image_path).data
  const [drawn, setDrawn] = useState<string | null>(null)
  useEffect(() => {
    if (!code.image_path) void QRCode.toDataURL(code.khqr_payload, { width: 160, margin: 1 }).then(setDrawn)
  }, [code.image_path, code.khqr_payload])
  const src = url ?? drawn
  // eslint-disable-next-line @next/next/no-img-element -- signed URL / generated data URL
  return src ? <img src={src} alt="KHQR" className="size-12 shrink-0 rounded-lg border bg-white object-contain" /> : <span className="size-12 shrink-0 rounded-lg bg-muted" />
}

/** One code: bank and currency (corrected when the code didn't say), default, delete. */
function CodeSheet({ code, workspaceId, onClose }: { code: KhqrCode; workspaceId: string; onClose: () => void }) {
  const t = useT()
  const { update, setDefault, remove } = useKhqrCodeMutations(workspaceId)
  const [bank, setBank] = useState<KhqrBank>(code.bank_code)
  const [currency, setCurrency] = useState(code.currency)
  const changed = bank !== code.bank_code || currency !== code.currency
  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={codeLabel({ bank_code: bank, currency })} description={code.merchant_name ?? undefined}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("khqr.bank")}</Label>
          <Select value={bank} onValueChange={(v) => setBank(v as KhqrBank)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BANK_LOOK) as KhqrBank[]).map((b) => (
                <SelectItem key={b} value={b}>
                  {BANK_LOOK[b].dot} {b === "OTHER" ? t("khqr.otherBank") : BANK_LOOK[b].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Segmented
          aria-label={t("khqr.currency")}
          value={currency}
          onChange={setCurrency}
          options={[
            { value: "USD", label: "$" },
            { value: "KHR", label: "៛" },
          ]}
        />
        {changed && (
          <Button className="h-11 w-full" disabled={update.isPending} onClick={() => void update.mutateAsync({ id: code.id, bank_code: bank, currency }).then(() => toast.success(t("bills.saved"))).then(onClose)}>
            {t("common.save")}
          </Button>
        )}
        {!code.is_default && (
          <Button variant="outline" className="h-11 w-full" disabled={setDefault.isPending} onClick={() => void setDefault.mutateAsync(code.id).then(onClose)}>
            <StarIcon />
            {t("khqr.makeDefault")}
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-10 w-full text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (!window.confirm(t("khqr.deleteConfirm", { name: codeLabel(code) }))) return
            void remove.mutateAsync(code).then(onClose)
          }}
        >
          <Trash2Icon />
          {t("common.delete")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/**
 * /invoices › the workspace's KHQR codes — one per bank and currency (ABA $, ABA ៛, ACLEDA ៛,
 * Wing…). The default goes on receipts (unless one matches the invoice's currency) and opens the
 * SoundBox; each is added from a screenshot of the bank app's QR (bank and currency read from it).
 */
export function KhqrList({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const t = useT()
  const codes = useWorkspaceKhqrs(workspaceId).data ?? []
  const { add } = useKhqrCodeMutations(workspaceId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<KhqrCode | null>(null)

  const pick = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      try {
        const r = await add.mutateAsync(file)
        if (r.status === "ok") toast.success(t("khqr.added", { name: codeLabel(r.code) }))
        else toast.error(t(r.status === "duplicate" ? "khqr.duplicate" : "invoices.khqrUnreadable"))
      } catch {
        toast.error(t("common.error"))
      }
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <QrCodeIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("khqr.title")}</p>
          <p className="text-xs text-muted-foreground">{t(codes.length ? "khqr.hint" : "invoices.khqrHint")}</p>
        </div>
      </div>
      {codes.length > 0 && (
        <ul className="divide-y border-t">
          {codes.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => editable && setOpen(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                <Thumb code={c} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{codeLabel(c)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.merchant_name ?? "—"}</span>
                </span>
                {c.is_default && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-600">
                    <StarIcon className="size-3.5 fill-current" aria-hidden />
                    {t("khqr.default")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="border-t px-4 py-3">
          <Button variant={codes.length ? "outline" : "default"} className="h-11 w-full" disabled={add.isPending} onClick={() => fileRef.current?.click()}>
            {add.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {t("khqr.add")}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void pick(e.target.files)} aria-label={t("khqr.add")} />
        </div>
      )}
      {open && <CodeSheet code={open} workspaceId={workspaceId} onClose={() => setOpen(null)} />}
    </Card>
  )
}
