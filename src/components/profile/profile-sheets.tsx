"use client"

import { ArchiveIcon, ArchiveRestoreIcon, CameraIcon, Loader2Icon, LogOutIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { stepUp } from "@/components/security/step-up"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import type { Profile, Workspace } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import { INDUSTRIES, useBusinessLifecycle, useSaveBusinessProfile, useSaveProfile } from "@/lib/profile"
import { usePrefsStore } from "@/stores/prefs-store"

import { ProfileAvatar } from "./profile-avatar"
import { OCCUPATIONS, useProfilePrivate, useSaveProfilePrivate, type Occupation } from "@/lib/profile-private"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { cn } from "@/lib/utils"

/** Photo with a camera badge (add / change) and a trash button (remove); keeps the picked file until Save. */
function PhotoPicker({
  path,
  name,
  business,
  file,
  removed,
  onFile,
  onRemove,
  disabled,
}: {
  path?: string | null
  name: string
  business?: boolean
  file: File | null
  removed: boolean
  onFile: (file: File) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const hasPhoto = Boolean(file || (path && !removed))

  return (
    <div className="flex items-end justify-center gap-2">
      <div className="relative">
        <ProfileAvatar path={removed ? null : path} preview={preview} name={name} business={business} className="size-24 text-3xl" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          aria-label={t(hasPhoto ? "profile.changePhoto" : "profile.addPhoto")}
          title={t(hasPhoto ? "profile.changePhoto" : "profile.addPhoto")}
          className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full border-2 border-popover bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          <CameraIcon className="size-4" aria-hidden />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ""
            if (!picked) return
            if (!picked.type.startsWith("image/") || picked.size > MAX_RECEIPT_INPUT_BYTES) return void toast.error(t("profile.photoInvalid"))
            onFile(picked)
          }}
        />
      </div>
      {hasPhoto && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="mb-0.5 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t("profile.removePhoto")}
          title={t("profile.removePhoto")}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  )
}

/** Edit my photo, name, phone and bio. */
export function ProfileSheet({ open, onOpenChange, profile, email }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile | undefined; email?: string }) {
  const t = useT()
  const router = useRouter()
  const save = useSaveProfile()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [bio, setBio] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [removed, setRemoved] = useState(false)
  // Optional, private (owner + super admin only): birthday wishes and a better fit of tips.
  const extras = useProfilePrivate().data
  const saveExtras = useSaveProfilePrivate()
  const [birthDate, setBirthDate] = useState("")
  const [occupation, setOccupation] = useState<Occupation | null>(null)

  useEffect(() => {
    if (!open) return
    setBirthDate(extras?.birth_date ?? "")
    setOccupation(extras?.occupation ?? null)
  }, [open, extras])

  useEffect(() => {
    if (!open) return
    setName(profile?.display_name ?? "")
    setPhone(profile?.phone ?? "")
    setBio(profile?.bio ?? "")
    setFile(null)
    setRemoved(false)
  }, [open, profile])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("profile.nameRequired"))
    if (birthDate && (birthDate > todayDate() || birthDate < "1900-01-01")) return void toast.error(t("profile.birthDateInvalid"))
    // The private details save on their own; a failure there doesn't undo the profile.
    if ((birthDate || null) !== (extras?.birth_date ?? null) || occupation !== (extras?.occupation ?? null)) {
      saveExtras.mutate({ birth_date: birthDate || null, occupation }, { onError: () => toast.error(t("common.error")) })
    }
    save.mutate(
      { display_name: name, phone, bio, photo: file, removePhoto: removed, avatar_path: profile?.avatar_path },
      {
        onSuccess: () => {
          toast.success(t("profile.saved"))
          onOpenChange(false)
        },
        onError: () => toast.error(t("common.error")),
      },
    )
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("profile.title")}
      headerAction={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("settings.signOut")}
          title={t("settings.signOut")}
          onClick={async () => {
            if (!window.confirm(t("settings.signOutConfirm"))) return
            onOpenChange(false)
            await signOutEverywhere()
            router.replace("/login")
          }}
        >
          <LogOutIcon />
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <PhotoPicker
          path={profile?.avatar_path}
          name={name}
          file={file}
          removed={removed}
          disabled={save.isPending}
          onFile={(f) => {
            setFile(f)
            setRemoved(false)
          }}
          onRemove={() => {
            setFile(null)
            setRemoved(true)
          }}
        />
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">{t("profile.name")}</Label>
          <Input id="profile-name" className="h-11" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-phone">{t("profile.phone")}</Label>
          <Input id="profile-phone" className="h-11" type="tel" inputMode="tel" maxLength={30} placeholder="012 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-bio">{t("profile.bio")}</Label>
          <Textarea id="profile-bio" rows={2} maxLength={200} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div className="space-y-3 rounded-xl border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">{t("profile.extrasTitle")}</p>
          <div className="space-y-1.5">
            <Label htmlFor="profile-birth">{t("profile.birthDate")}</Label>
            <Input id="profile-birth" className="h-11" type="date" min="1900-01-01" max={todayDate()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.occupation")}</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("profile.occupation")}>
              {OCCUPATIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={occupation === o}
                  // Tapping the chosen one again clears it (it's optional).
                  onClick={() => setOccupation(occupation === o ? null : o)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    occupation === o ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  {t(`occupation.${o}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("profile.extrasHint")}</p>
        </div>
        {email && <p className="text-xs text-muted-foreground">{t("profile.signedInAs", { email })}</p>}
        <p className="text-xs text-muted-foreground">{t("profile.visibility")}</p>
        <Button type="submit" className="h-12 w-full text-base" disabled={save.isPending}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </form>
    </BottomSheet>
  )
}

/** Edit the business profile of a BUSINESS workspace (owner only; others see it read-only). */
export function BusinessProfileSheet({ open, onOpenChange, workspace }: { open: boolean; onOpenChange: (open: boolean) => void; workspace: Workspace | undefined }) {
  const t = useT()
  const save = useSaveBusinessProfile()
  const lifecycle = useBusinessLifecycle()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [industry, setIndustry] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [removed, setRemoved] = useState(false)
  const owner = workspace?.role === "OWNER"

  useEffect(() => {
    if (!open || !workspace) return
    setName(workspace.name)
    setPhone(workspace.business_phone ?? "")
    setAddress(workspace.business_address ?? "")
    setIndustry(workspace.business_industry ?? "")
    setFile(null)
    setRemoved(false)
  }, [open, workspace])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace || !owner) return
    if (!name.trim()) return void toast.error(t("profile.nameRequired"))
    save.mutate(
      { workspaceId: workspace.id, name, phone, address, industry, photo: file, removePhoto: removed, logo_path: workspace.logo_path },
      {
        onSuccess: () => {
          toast.success(t("profile.saved"))
          onOpenChange(false)
        },
        onError: () => toast.error(t("common.error")),
      },
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("business.title")}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!owner || save.isPending} className="space-y-4">
          <PhotoPicker
            path={workspace?.logo_path}
            name={name}
            business
            file={file}
            removed={removed}
            disabled={!owner || save.isPending}
            onFile={(f) => {
              setFile(f)
              setRemoved(false)
            }}
            onRemove={() => {
              setFile(null)
              setRemoved(true)
            }}
          />
          <div className="space-y-1.5">
            <Label htmlFor="biz-name">{t("business.name")}</Label>
            <Input id="biz-name" className="h-11" maxLength={60} placeholder="DL MEAT SUPPLY" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("business.industry")}</Label>
            <Select value={industry || undefined} onValueChange={setIndustry}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder={t("business.industryPick")} />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`industry.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-phone">{t("business.phone")}</Label>
            <Input id="biz-phone" className="h-11" type="tel" inputMode="tel" maxLength={30} placeholder="012 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-address">{t("business.address")}</Label>
            <Textarea id="biz-address" rows={2} maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </fieldset>
        {owner ? (
          <Button type="submit" className="h-12 w-full text-base" disabled={save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {t("common.save")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t("business.ownerOnly")}</p>
        )}
        {owner && workspace && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs text-muted-foreground">{t("business.closeHint")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={lifecycle.setArchived.isPending}
                onClick={async () => {
                  if (!workspace.archived_at && !(await stepUp(t("business.archiveConfirm", { name: workspace.name })))) return
                  lifecycle.setArchived.mutate(
                    { id: workspace.id, archived: !workspace.archived_at },
                    {
                      onSuccess: () => {
                        toast.success(t(workspace.archived_at ? "business.restored" : "business.archived"))
                        onOpenChange(false)
                      },
                      onError: (e) => toast.error(t(String(e.message).includes("last_business") ? "business.lastOne" : "common.error")),
                    },
                  )
                }}
              >
                {workspace.archived_at ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                {t(workspace.archived_at ? "business.restore" : "business.archive")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={lifecycle.remove.isPending}
                onClick={async () => {
                  // Permanent: ask for the business name, like deleting a repository.
                  const typed = window.prompt(t("business.deleteConfirm", { name: workspace.name }))
                  if (typed === null) return
                  if (typed.trim() !== workspace.name.trim()) return void toast.error(t("business.deleteMismatch"))
                  if (!(await stepUp(t("business.delete")))) return
                  lifecycle.remove.mutate(workspace.id, {
                    onSuccess: () => {
                      toast.success(t("business.deleted", { name: workspace.name }))
                      setActive("BUSINESS", null)
                      onOpenChange(false)
                    },
                    onError: (e) => toast.error(t(String(e.message).includes("last_business") ? "business.lastOne" : "common.error")),
                  })
                }}
              >
                <Trash2Icon />
                {t("business.delete")}
              </Button>
            </div>
          </div>
        )}
      </form>
    </BottomSheet>
  )
}
