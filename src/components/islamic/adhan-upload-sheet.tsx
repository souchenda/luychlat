"use client"

import { GlobeIcon, Loader2Icon, SmartphoneIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GLOBAL_ADHAN_MAX_BYTES, globalAdhanError, type AdhanScope } from "@/lib/adhan-presets"
import { usePublishAdhan, useSetAdhanDefault } from "@/lib/adhan-presets-data"
import { useKhmerT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/**
 * The super admin's Adhan upload (founder, 19/10/2026): where the file goes —
 *   «សម្រាប់តែឧបករណ៍នេះ» → this phone only (IndexedDB, as every member's file);
 *   «ដាក់ចូលអេប ប្រើរួមគ្នាទាំងអស់» → cleaned on the server and in every member's Adhan list, with its name, reciter
 *   and the rights confirmed — no code change, no deploy.
 * Regular members never see this sheet: their file is kept on the phone at once.
 */
export function AdhanUploadSheet({
  file,
  onOpenChange,
  onKeepOnDevice,
  onPublished,
  setAsDefault,
}: {
  file: File | null
  onOpenChange: (open: boolean) => void
  onKeepOnDevice: (file: File) => Promise<void>
  onPublished: (presetId: string) => void
  /** «⬆️ បង្ហោះ និងកំណត់ជាសកល» from the phone file (founder, 19/10/2026): publish it and make it the regular / Fajr default. */
  setAsDefault?: "regular" | "fajr"
}) {
  const t = useKhmerT()
  const publish = usePublishAdhan()
  const setDefault = useSetAdhanDefault()
  const [scope, setScope] = useState<AdhanScope>("device")
  const [nameKm, setNameKm] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [credit, setCredit] = useState("")
  const [rights, setRights] = useState(false)
  const [saving, setSaving] = useState(false)

  // A new file: start from «this device», the file's name as a suggestion.
  useEffect(() => {
    if (!file) return
    setScope(setAsDefault ? "global" : "device")
    setNameKm(setAsDefault ? "អាហ្សានផ្លូវការ អេប លុយឆ្លាត" : file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80))
    setNameEn("")
    setCredit("")
    setRights(false)
  }, [file, setAsDefault])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    if (scope === "device") {
      setSaving(true)
      try {
        await onKeepOnDevice(file)
        onOpenChange(false)
      } finally {
        setSaving(false)
      }
      return
    }
    if (file.size > GLOBAL_ADHAN_MAX_BYTES) return void toast.error(t("adhanUpload.tooBig"))
    const problem = globalAdhanError({ nameKm, credit, rights })
    if (problem) return void toast.error(t(problem))
    publish.mutate(
      { file, nameKm: nameKm.trim(), nameEn: nameEn.trim(), credit: credit.trim() },
      {
        onSuccess: (id) => {
          if (!setAsDefault) {
            toast.success(t("adhanUpload.published"))
            onPublished(id)
            onOpenChange(false)
            return
          }
          // Published — now the default for everyone (admin_adhan_set, audited ADHAN_PUBLISH).
          setDefault.mutate(
            { kind: setAsDefault, preset: id },
            {
              onSuccess: () => {
                toast.success(t("adhanUpload.publishedGlobal"))
                onPublished(id)
                onOpenChange(false)
              },
              onError: () => toast.error(t("adhanUpload.failed")),
            },
          )
        },
        onError: (err) => toast.error(t(err.message === "too_big" ? "adhanUpload.tooBig" : err.message === "not_audio" ? "prayerAlert.notAudio" : "adhanUpload.failed")),
      },
    )
  }

  const option = (value: AdhanScope, Icon: typeof GlobeIcon, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={scope === value}
      onClick={() => setScope(value)}
      className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left", scope === value && "border-primary bg-primary/5 ring-1 ring-primary")}
    >
      <span className={cn("size-4 shrink-0 rounded-full border-2", scope === value ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]" : "border-muted-foreground/40")} aria-hidden />
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  )

  const busy = saving || publish.isPending || setDefault.isPending
  return (
    <BottomSheet open={file !== null} onOpenChange={onOpenChange} title={t("adhanUpload.title")}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <p className="truncate text-xs text-muted-foreground">🎵 {file?.name}</p>
        <div role="radiogroup" aria-label={t("adhanUpload.scope")} className={cn("space-y-2", setAsDefault && "hidden")}>
          {option("device", SmartphoneIcon, t("adhanUpload.device"), t("adhanUpload.deviceHint"))}
          {option("global", GlobeIcon, t("adhanUpload.global"), t("adhanUpload.globalHint"))}
        </div>
        {scope === "global" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="adhan-name-km">{t("adhanUpload.nameKm")}</Label>
              <Input id="adhan-name-km" value={nameKm} onChange={(e) => setNameKm(e.target.value)} maxLength={80} placeholder={t("adhanUpload.nameKmPlaceholder")} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adhan-name-en">{t("adhanUpload.nameEn")}</Label>
              <Input id="adhan-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={80} placeholder="Fajr Adhan" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adhan-credit">{t("adhanUpload.credit")}</Label>
              <Input id="adhan-credit" value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={200} placeholder={t("adhanUpload.creditPlaceholder")} className="h-11" />
            </div>
            <label htmlFor="adhan-rights" className="flex min-h-11 items-start gap-3 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
              <input id="adhan-rights" type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-emerald-600" />
              <span>{t("adhanUpload.confirm")}</span>
            </label>
          </>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {busy && setAsDefault
            ? t("adhanUpload.uploadingGlobal")
            : setAsDefault
              ? `⬆️ ${setAsDefault === "fajr" ? "🌅" : "🌐"} ${t(setAsDefault === "fajr" ? "adhanUpload.publishFajr" : "adhanUpload.publishRegular")}`
              : t(scope === "global" ? (publish.isPending ? "adhanUpload.publishing" : "adhanUpload.publish") : "adhanUpload.keep")}
        </Button>
      </form>
    </BottomSheet>
  )
}
