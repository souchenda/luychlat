"use client"

import { CameraIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Profile, Workspace } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { MAX_RECEIPT_INPUT_BYTES } from "@/lib/image"
import { INDUSTRIES, useSaveBusinessProfile, useSaveProfile } from "@/lib/profile"

import { ProfileAvatar } from "./profile-avatar"

/** Photo with "change" / "remove" buttons; keeps the picked file until Save. */
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
    <div className="flex items-center gap-4">
      <ProfileAvatar path={removed ? null : path} preview={preview} name={name} business={business} className="size-20 text-2xl" />
      <div className="flex flex-col gap-2">
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
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
          <CameraIcon />
          {t(hasPhoto ? "profile.changePhoto" : "profile.addPhoto")}
        </Button>
        {hasPhoto && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={onRemove}>
            <Trash2Icon />
            {t("profile.removePhoto")}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Edit my photo, name, phone and bio. */
export function ProfileSheet({ open, onOpenChange, profile, email }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile | undefined; email?: string }) {
  const t = useT()
  const save = useSaveProfile()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [bio, setBio] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [removed, setRemoved] = useState(false)

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
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("profile.title")}>
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
      </form>
    </BottomSheet>
  )
}
