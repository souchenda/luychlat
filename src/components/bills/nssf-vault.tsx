"use client"

import { CameraIcon, CopyIcon, IdCardIcon, Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
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
import { NSSF_MONTHLY_PER_MEMBER, useNssfMembers, useNssfMutations, useNssfPhotoUrl, type NssfMember, type NssfRelationship } from "@/lib/bills"
import { compressImage, MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
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

function PhotoPicker({ label, path, onChange }: { label: string; path: string | null; onChange: (path: string | null) => void }) {
  const t = useT()
  const { uploadPhoto, removePhoto } = useNssfMutations()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_RECEIPT_INPUT_BYTES || !file.type.startsWith("image/")) return void toast.error(t("nssf.photoInvalid"))
    setBusy(true)
    try {
      const next = await uploadPhoto(await compressImage(file, 1600, 0.85))
      if (path) await removePhoto(path)
      onChange(next)
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        {path ? (
          <>
            <Photo path={path} label={label} onOpen={setViewing} />
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
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
            {t("nssf.addPhoto")}
          </Button>
        )}
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
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
            inputMode="numeric"
            onChange={(e) => set({ nssfId: e.target.value.replace(/[^A-Za-z0-9 ./-]/g, "") })}
            className="h-11 font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PhotoPicker label={t("nssf.front")} path={form.front} onChange={(front) => set({ front })} />
          <PhotoPicker label={t("nssf.back")} path={form.back} onChange={(back) => set({ back })} />
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
