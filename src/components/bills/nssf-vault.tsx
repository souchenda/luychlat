"use client"

import { CameraIcon, ImageIcon, CopyIcon, IdCardIcon, Loader2Icon, PlusIcon, ScissorsIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { NSSF_MONTHLY_PER_MEMBER, signedPhotoUrl, useNssfMembers, useNssfMutations, useNssfPhotoUrl, type NssfMember, type NssfRelationship } from "@/lib/bills"
import { compressImage, MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { useProfile } from "@/lib/data/hooks"
import { decodeQrText } from "@/lib/khqr-decode"
import { cardName, guessRelationship, qrConfirmsId, type NssfCard } from "@/lib/nssf-card"
import { cropCardImage, reportCrop } from "@/lib/card-crop-browser"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/** A card photo: thumbnail from a short-lived signed URL; tap to view large. */
function Photo({ path, label, onOpen }: { path: string; label: string; onOpen: (url: string) => void }) {
  const url = useNssfPhotoUrl(path).data
  return (
    <button type="button" onClick={() => url && onOpen(url)} className="h-14 w-20 overflow-hidden rounded-lg border bg-muted" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      {url ? <img src={url} alt={label} className="h-full w-full object-cover" /> : <Loader2Icon className="mx-auto size-4 animate-spin text-muted-foreground" />}
    </button>
  )
}

function PhotoPicker({
  label,
  path,
  onChange,
  prepare,
  recrop,
  scanning = false,
}: {
  label: string
  path: string | null
  onChange: (path: string | null) => void
  /** The new photo → what is stored: the card alone (null: no card found — nothing is stored). */
  prepare?: (image: Blob) => Promise<Blob | null>
  /** A stored photo → the card alone, cut out again (null: no card found). */
  recrop?: (image: Blob) => Promise<Blob | null>
  scanning?: boolean
}) {
  const t = useT()
  const { uploadPhoto, removePhoto } = useNssfMutations()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  // The photo just taken, shown at once while it uploads (and is read).
  const [preview, setPreview] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_RECEIPT_INPUT_BYTES || !file.type.startsWith("image/")) return void toast.error(t("nssf.photoInvalid"))
    setBusy(true)
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      const image = await compressImage(file, 1600, 0.85)
      // Only the clean card is kept (the table and the background are cut away) — never the raw photo.
      const stored = prepare ? await prepare(image) : image
      if (!stored) return void toast.error(t("nssf.cropFailed"))
      const next = await uploadPhoto(stored)
      if (path) await removePhoto(path)
      onChange(next)
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
      setPreview(null)
      URL.revokeObjectURL(local)
      for (const el of [camera.current, gallery.current]) if (el) el.value = ""
    }
  }

  /** «កាត់រូបម្ដងទៀត»: the stored photo, cut to the card and stored in its place. */
  const cropAgain = async (current: string) => {
    if (!recrop) return
    setBusy(true)
    try {
      const url = await signedPhotoUrl(current)
      const res = url ? await fetch(url, { cache: "no-store" }) : null
      if (!res?.ok) return void toast.error(t("common.error"))
      const card = await recrop(await res.blob())
      if (!card) return void toast.error(t("nssf.cropFailed"))
      const next = await uploadPhoto(card)
      await removePhoto(current)
      onChange(next)
      toast.success(t("nssf.recropped"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview of the photo just taken
          <img src={preview} alt={label} className="size-16 rounded-lg object-cover ring-1 ring-border" />
        ) : path ? (
          <>
            <Photo path={path} label={label} onOpen={setViewing} />
            {recrop && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void cropAgain(path)}>
                {busy ? <Loader2Icon className="animate-spin" /> : <ScissorsIcon />}
                {t("nssf.recrop")}
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("nssf.removePhoto")}
              onClick={() => {
                void removePhoto(path)
                onChange(null)
              }}
            >
              <XIcon />
            </Button>
          </>
        ) : (
          <>
            {/* The phone's camera opens straight away (capture); the second button picks a saved photo. */}
            <Button type="button" variant="outline" size="sm" disabled={busy || scanning} onClick={() => camera.current?.click()}>
              {busy || scanning ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
              {t("nssf.takePhoto")}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy || scanning} onClick={() => gallery.current?.click()}>
              <ImageIcon />
              {t("nssf.fromGallery")}
            </Button>
          </>
        )}
        {busy && preview && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {scanning && <p className="text-[11px] text-muted-foreground">{t("nssf.ocrReading")}</p>}
      <Dialog open={viewing !== null} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-lg p-2">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          {viewing && <img src={viewing} alt={label} className="max-h-[80dvh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Form = { name: string; relationship: NssfRelationship; nssfId: string; front: string | null; back: string | null; active: boolean }

function MemberSheet({ member, onClose }: { member: NssfMember | null; onClose: () => void }) {
  const t = useT()
  const { save, remove } = useNssfMutations()
  const [form, setForm] = useState<Form>({ name: "", relationship: "self", nssfId: "", front: null, back: null, active: true })
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const profileName = useProfile().data?.display_name
  const [scanning, setScanning] = useState(false)

  // The front of the card: Vision reads name, ID, birth date (and the card's QR, if any, confirms the ID),
  // and where the card is in the photo — the photo kept is the card alone, straightened.
  const scan = async (image: Blob): Promise<Blob | null> => {
    setScanning(true)
    try {
      const body = new FormData()
      body.append("image", image, "card.jpg")
      const [res, qr] = await Promise.all([fetch("/api/nssf/ocr", { method: "POST", body }).catch(() => null), decodeQrText(image).catch(() => null)])
      const json = (await res?.json().catch(() => null)) as { card?: NssfCard; corners?: unknown; box?: unknown; error?: string } | null
      const crop = await cropCardImage(image, json?.corners, json?.box)
      if (!crop.blob) reportCrop("front", crop.why)
      const cropped = crop.blob ?? null
      const card = json?.card
      if (!card) {
        toast.info(t(json?.error === "busy" || !res ? "nssf.ocrBusy" : "nssf.ocrNone"))
        return cropped
      }
      const today = new Date().toISOString().slice(0, 10)
      setForm((f) => ({
        ...f,
        name: cardName(card) || f.name,
        nssfId: card.idNumber ?? f.nssfId,
        // An existing member keeps their relationship; a new one gets the smart guess.
        relationship: member ? f.relationship : (guessRelationship(card, profileName, today) ?? f.relationship),
      }))
      toast.success(t(qrConfirmsId(qr, card.idNumber) ? "nssf.ocrVerified" : "nssf.ocrFilled"))
      return cropped
    } finally {
      setScanning(false)
    }
  }

  /** Only cut out (nothing to read): the back of a card, or a stored photo cropped again. */
  const cropOnly = (side: "back" | "crop") => async (image: Blob): Promise<Blob | null> => {
    const body = new FormData()
    body.append("image", image, "card.jpg")
    body.append("side", side)
    const res = await fetch("/api/nssf/ocr", { method: "POST", body }).catch(() => null)
    const json = (await res?.json().catch(() => null)) as { corners?: unknown; box?: unknown } | null
    const crop = await cropCardImage(image, json?.corners, json?.box)
    if (!crop.blob) reportCrop(side, crop.why)
    return crop.blob
  }

  useEffect(() => {
    setForm(
      member
        ? { name: member.name, relationship: member.relationship, nssfId: member.nssf_id ?? "", front: member.front_path, back: member.back_path, active: member.is_active }
        : { name: "", relationship: "self", nssfId: "", front: null, back: null, active: true },
    )
  }, [member])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      await save.mutateAsync({
        id: member?.id,
        input: { name: form.name.trim(), relationship: form.relationship, nssf_id: form.nssfId.trim() || null, front_path: form.front, back_path: form.back, is_active: form.active },
      })
      toast.success(t("bills.saved"))
      onClose()
    } catch {
      toast.error(t("nssf.invalid"))
    }
  }

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={member ? t("nssf.editTitle") : t("nssf.newTitle")} description={t("nssf.privateNote")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nssf-name">{t("nssf.name")}</Label>
          <Input id="nssf-name" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className="h-11" />
        </div>
        <Segmented
          aria-label={t("nssf.relationship")}
          value={form.relationship}
          onChange={(v) => set({ relationship: v })}
          options={[
            { value: "self", label: t("nssf.rel.self") },
            { value: "spouse", label: t("nssf.rel.spouse") },
            { value: "child", label: t("nssf.rel.child") },
          ]}
        />
        <div className="space-y-2">
          <Label htmlFor="nssf-id">{t("nssf.id")}</Label>
          <Input
            id="nssf-id"
            value={form.nssfId}
            maxLength={40}
            // A text keyboard: some card numbers end in a Khmer letter ("…-ឈ").
            inputMode="text"
            onChange={(e) => set({ nssfId: e.target.value.replace(/[^A-Za-z0-9\u1780-\u17FF ./-]/g, "") })}
            className="h-11 font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PhotoPicker label={t("nssf.front")} path={form.front} onChange={(front) => set({ front })} prepare={scan} recrop={cropOnly("crop")} scanning={scanning} />
          <PhotoPicker label={t("nssf.back")} path={form.back} onChange={(back) => set({ back })} prepare={cropOnly("back")} recrop={cropOnly("crop")} />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="block font-medium">{t("nssf.active")}</span>
            <span className="block text-xs text-muted-foreground">{t("nssf.activeHint")}</span>
          </span>
          <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
        </label>
        <div className="flex gap-2">
          {member && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 text-destructive"
              aria-label={t("bills.delete")}
              onClick={async () => {
                if (!window.confirm(t("bills.deleteConfirm", { name: member.name }))) return
                await remove.mutateAsync(member)
                onClose()
              }}
            >
              <Trash2Icon />
            </Button>
          )}
          <Button type="submit" className="h-12 flex-1 text-base" disabled={!form.name.trim() || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}

/** /bills › NSSF cards: members, IDs with 1-tap copy, card photos; the count drives the NSSF bill suggestion. */
export function NssfVault() {
  const t = useT()
  const hidden = usePrefsStore((s) => s.hideBalances)
  const members = useNssfMembers().data ?? []
  const [editing, setEditing] = useState<NssfMember | null | "new">(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const active = members.filter((m) => m.is_active).length

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id.replace(/\s/g, ""))
      toast.success(t("nssf.copied"))
    } catch {
      toast.error(id)
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <IdCardIcon className="size-4" aria-hidden />
          {t("nssf.vaultTitle")}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
          <PlusIcon />
          {t("nssf.addMember")}
        </Button>
      </div>
      <Card className="gap-0 divide-y py-0">
        {!members.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("nssf.empty")}</p>
        ) : (
          members.map((m) => (
            <div key={m.id} className={cn("space-y-2 px-4 py-3", !m.is_active && "opacity-60")}>
              <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-2 text-left">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t(`nssf.rel.${m.relationship}`)}</span>
              </button>
              {m.nssf_id && (
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-sm tracking-wide tabular-nums">{hidden ? `•••• ${m.nssf_id.slice(-4)}` : m.nssf_id}</span>
                  <Button size="sm" variant="outline" onClick={() => void copy(m.nssf_id!)}>
                    <CopyIcon />
                    {t("nssf.copyId")}
                  </Button>
                </div>
              )}
              {(m.front_path || m.back_path) && (
                <div className="flex gap-2">
                  {m.front_path && <Photo path={m.front_path} label={t("nssf.front")} onOpen={setViewing} />}
                  {m.back_path && <Photo path={m.back_path} label={t("nssf.back")} onOpen={setViewing} />}
                </div>
              )}
            </div>
          ))
        )}
      </Card>
      {active > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {t("nssf.total", {
            count: active,
            monthly: formatMoney(NSSF_MONTHLY_PER_MEMBER * active, "KHR"),
            yearly: formatMoney(NSSF_MONTHLY_PER_MEMBER * active * 12, "KHR"),
          })}
        </p>
      )}
      {editing && <MemberSheet member={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <Dialog open={viewing !== null} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-lg p-2">
          <DialogTitle className="sr-only">{t("nssf.vaultTitle")}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          {viewing && <img src={viewing} alt="" className="max-h-[80dvh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  )
}
