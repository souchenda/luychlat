"use client"

import { CameraIcon, ImageIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { CardCheckPhoto, VerifyBanner } from "@/components/cards/verify-panel"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { decodeCardCode } from "@/lib/card-code"
import { cropCardImage, cropCardPhoto, reportCrop } from "@/lib/card-crop-browser"
import { hasUnread, KIND_SPECS, type CardKind, type DetailKey, type IdCardRead } from "@/lib/id-card"
import { useIdCardMutations, type IdCard, type IdCardInput } from "@/lib/id-cards"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { compressImage, MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import { identityFromQr } from "@/lib/nssf-card"
import { cn } from "@/lib/utils"

type Form = {
  holderKh: string
  holderEn: string
  number: string
  dob: string
  gender: "MALE" | "FEMALE" | null
  issued: string
  expiry: string
  issuer: string
  details: Partial<Record<DetailKey, string>>
  qrText: string | null
  front: string | null
  back: string | null
  note: string
}
const EMPTY: Form = { holderKh: "", holderEn: "", number: "", dob: "", gender: null, issued: "", expiry: "", issuer: "", details: {}, qrText: null, front: null, back: null, note: "" }

const fromCard = (c: IdCard): Form => ({
  holderKh: c.holder_kh ?? "",
  holderEn: c.holder_en ?? "",
  number: c.doc_number ?? "",
  dob: c.dob ?? "",
  gender: c.gender,
  issued: c.issued_on ?? "",
  expiry: c.expires_on ?? "",
  issuer: c.issuer ?? "",
  details: c.details ?? {},
  qrText: c.qr_text,
  front: c.front_path,
  back: c.back_path,
  note: c.note ?? "",
})

/** Camera (opens straight away) or gallery; the photo comes back at full resolution. */
function PhotoButtons({ label, busy, onPhoto }: { label: string; busy: boolean; onPhoto: (image: Blob) => void }) {
  const t = useT()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const pick = async (file: File | undefined) => {
    for (const el of [camera.current, gallery.current]) if (el) el.value = ""
    if (!file) return
    if (file.size > MAX_RECEIPT_INPUT_BYTES || !file.type.startsWith("image/")) return void toast.error(t("nssf.photoInvalid"))
    onPhoto(await compressImage(file, 3200, 0.95))
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => camera.current?.click()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
          {t("nssf.takePhoto")}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => gallery.current?.click()}>
          <ImageIcon />
          {t("nssf.fromGallery")}
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  )
}

/**
 * Add / edit a vault card: photo first (its code read on the phone, then Vision reads the rest),
 * the card photo right above the fields read from it, and the 100% check before saving.
 */
export function IdCardSheet({ kind, card, onClose }: { kind: CardKind; card: IdCard | null; onClose: () => void }) {
  const t = useT()
  const spec = KIND_SPECS[kind]
  const { save, remove, uploadPhoto, removePhoto } = useIdCardMutations()
  const [form, setForm] = useState<Form>(card ? fromCard(card) : EMPTY)
  const [busy, setBusy] = useState<"front" | "back" | null>(null)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const setDetail = (key: DetailKey, value: string) => setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }))

  useEffect(() => setForm(card ? fromCard(card) : EMPTY), [card])

  const unread = hasUnread(form.holderKh, form.holderEn, form.number, form.issuer, ...Object.values(form.details))
  const title = t(`cards.kind.${kind}` as MessageKey)

  const apply = (r: IdCardRead) =>
    setForm((f) => ({
      ...f,
      holderKh: r.holderKh ?? f.holderKh,
      holderEn: r.holderEn ?? f.holderEn,
      number: r.number ?? f.number,
      dob: r.dob ?? f.dob,
      gender: r.gender ?? f.gender,
      issued: r.issued ?? f.issued,
      expiry: r.expiry ?? f.expiry,
      issuer: r.issuer ?? f.issuer,
      details: { ...f.details, ...r.details },
    }))

  /** The card's own QR / barcode first (authoritative for what it states), then Vision. */
  const applyCode = (code: string | null) => {
    if (!code) return false
    const id = identityFromQr(code)
    setForm((f) => ({
      ...f,
      qrText: code.slice(0, 2000),
      ...(id ? { number: id.idNumber ?? f.number, holderKh: id.nameKh ?? f.holderKh, holderEn: id.nameEn ?? f.holderEn, dob: id.dob ?? f.dob } : {}),
    }))
    return Boolean(id)
  }

  const store = async (side: "front" | "back", blob: Blob | null) => {
    if (!spec.storesPhotos) return
    if (!blob) return void toast.error(t("nssf.cropFailed"))
    const path = await uploadPhoto(blob)
    const old = form[side]
    if (old && old !== card?.[side === "front" ? "front_path" : "back_path"]) await removePhoto(old)
    set({ [side]: path } as Partial<Form>)
  }

  const scanFront = async (image: Blob) => {
    setBusy("front")
    try {
      const body = new FormData()
      body.append("image", await compressImage(new File([image], "card.jpg", { type: "image/jpeg" }), 1800, 0.88), "card.jpg")
      body.append("kind", kind)
      const [code, res] = await Promise.all([decodeCardCode(image), fetch("/api/nssf/ocr", { method: "POST", body }).catch(() => null)])
      const json = (await res?.json().catch(() => null)) as { read?: IdCardRead; corners?: unknown; box?: unknown; error?: string } | null
      if (json?.read) apply(json.read)
      // Applied after the reading: whatever the card's code states wins.
      const fromCode = applyCode(code)
      if (spec.storesPhotos) {
        const crop = await cropCardImage(image, json?.corners, json?.box)
        if (!crop.blob) reportCrop(`${kind} front`, crop.why)
        await store("front", crop.blob)
      }
      if (!json?.read && !fromCode) toast.info(t(json?.error === "busy" || !res ? "nssf.ocrBusy" : "nssf.ocrNone"))
      else toast.success(t(fromCode ? "cards.fromCode" : json?.read?.uncertain ? "cards.readUncertain" : "nssf.ocrFilled"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const scanBack = async (image: Blob) => {
    setBusy("back")
    try {
      if (applyCode(await decodeCardCode(image))) toast.success(t("cards.fromCode"))
      await store("back", await cropCardPhoto(image, "back"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (unread) return
    const details = Object.fromEntries(Object.entries(form.details).filter(([k, v]) => spec.details.includes(k as DetailKey) && v?.trim()).map(([k, v]) => [k, v!.trim()]))
    if (kind === "BANK_CARD" && details.last4 && !/^\d{4}$/.test(details.last4)) return void toast.error(t("cards.last4Invalid"))
    const input: Partial<IdCardInput> = {
      kind,
      holder_kh: form.holderKh.trim() || null,
      holder_en: form.holderEn.trim().toUpperCase() || null,
      doc_number: spec.fields.number ? form.number.trim() || null : null,
      dob: form.dob || null,
      gender: form.gender,
      issued_on: form.issued || null,
      expires_on: form.expiry || null,
      issuer: form.issuer.trim() || null,
      details,
      qr_text: spec.storesPhotos ? form.qrText : null,
      front_path: spec.storesPhotos ? form.front : null,
      back_path: spec.storesPhotos ? form.back : null,
      note: form.note.trim() || null,
      // Saved here, with the warning and the card photo in view: checked by the user.
      verified_by_user: true,
      is_uncertain: false,
    }
    if (!input.holder_kh && !input.holder_en && !input.doc_number && !input.issuer) return void toast.error(t("cards.needOne"))
    try {
      await save.mutateAsync({ id: card?.id, input })
      // Photos replaced or removed in this form: their old files go too.
      for (const old of [card?.front_path, card?.back_path]) if (old && old !== input.front_path && old !== input.back_path) await removePhoto(old)
      toast.success(t("bills.saved"))
      onClose()
    } catch {
      toast.error(t("nssf.invalid"))
    }
  }

  const field = (id: string, label: MessageKey, value: string, onChange: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(label)}</Label>
      <Input {...extra} id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-11", extra.className, value.includes("?") && "border-rose-500 ring-1 ring-rose-500/40")} />
    </div>
  )

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={title} description={t(spec.storesPhotos ? "cards.privateNote" : "cards.bankNote")}>
      <form onSubmit={submit} className="space-y-4">
        <VerifyBanner uncertain={unread} />
        {spec.storesPhotos && <CardCheckPhoto bucket="id-cards" front={form.front} back={form.back} title={form.holderKh || form.holderEn || title} />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PhotoButtons label={t(spec.storesPhotos ? (form.front ? "cards.retakeFront" : "cards.front") : "cards.scanOnly")} busy={busy === "front"} onPhoto={(img) => void scanFront(img)} />
          {spec.hasBack && <PhotoButtons label={t(form.back ? "cards.retakeBack" : "cards.back")} busy={busy === "back"} onPhoto={(img) => void scanBack(img)} />}
        </div>
        {spec.storesPhotos && (form.front || form.back) && (
          <div className="flex gap-2">
            {(["front", "back"] as const).map((side) =>
              form[side] ? (
                <Button key={side} type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => set({ [side]: null } as Partial<Form>)}>
                  <XIcon />
                  {t(side === "front" ? "cards.removeFront" : "cards.removeBack")}
                </Button>
              ) : null,
            )}
          </div>
        )}

        {spec.fields.holder && field("card-kh", "cards.field.holderKh", form.holderKh, (v) => set({ holderKh: v }), { maxLength: 80 })}
        {spec.fields.holder && field("card-en", "cards.field.holderEn", form.holderEn, (v) => set({ holderEn: v.replace(/[^A-Za-z .'?-]/g, "") }), { maxLength: 80, autoCapitalize: "characters" })}
        {spec.fields.issuer && field("card-issuer", kind === "BANK_CARD" ? "cards.field.bank" : "cards.field.insurer", form.issuer, (v) => set({ issuer: v }), { maxLength: 80 })}
        {spec.fields.number &&
          field("card-no", `cards.number.${kind}` as MessageKey, form.number, (v) => set({ number: v.replace(/[^A-Za-z0-9ក-៿ ./?-]/g, "") }), { maxLength: 40, className: "h-11 font-mono" })}
        {spec.details.map((key) =>
          field(`card-${key}`, `cards.detail.${key}` as MessageKey, form.details[key] ?? "", (v) => setDetail(key, key === "last4" ? v.replace(/\D/g, "").slice(0, 4) : v), {
            maxLength: key === "last4" ? 4 : 60,
            inputMode: key === "last4" || key === "year" ? "numeric" : "text",
          }),
        )}
        {(spec.fields.dob || spec.fields.gender) && (
          <div className="grid grid-cols-2 gap-3">
            {spec.fields.dob && field("card-dob", "nssf.dob", form.dob, (v) => set({ dob: v }), { type: "date" })}
            {spec.fields.gender && (
              <div className="space-y-2">
                <Label>{t("nssf.gender")}</Label>
                <Segmented<"MALE" | "FEMALE" | "">
                  aria-label={t("nssf.gender")}
                  value={form.gender ?? ""}
                  onChange={(v) => set({ gender: v || null })}
                  options={[
                    { value: "MALE", label: t("nssf.male") },
                    { value: "FEMALE", label: t("nssf.female") },
                  ]}
                />
              </div>
            )}
          </div>
        )}
        {(spec.fields.issued || spec.fields.expiry) && (
          <div className="grid grid-cols-2 gap-3">
            {spec.fields.issued && field("card-issued", "cards.field.issued", form.issued, (v) => set({ issued: v }), { type: "date" })}
            {spec.fields.expiry && field("card-expiry", "cards.field.expiry", form.expiry, (v) => set({ expiry: v }), { type: "date" })}
          </div>
        )}
        {field("card-note", "cards.field.note", form.note, (v) => set({ note: v }), { maxLength: 300 })}

        <div className="flex gap-2">
          {card && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 text-destructive"
              aria-label={t("bills.delete")}
              onClick={async () => {
                if (!window.confirm(t("cards.deleteConfirm"))) return
                await remove.mutateAsync(card)
                onClose()
              }}
            >
              <Trash2Icon />
            </Button>
          )}
          <Button type="submit" className="h-12 flex-1 text-base" disabled={unread || busy !== null || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {t("cards.saveChecked")}
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}
