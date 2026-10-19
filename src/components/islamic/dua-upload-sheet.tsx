"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { duaUploadError } from "@/lib/dua-audio"
import { useDuaRemove, useDuaUpload, type DuaUploaded } from "@/lib/dua-audio-data"
import type { Dua } from "@/lib/duas"
import { useKhmerT } from "@/lib/i18n/use-t"

/**
 * «📤 បញ្ចូលសំឡេង» (super admin, founder 19/10/2026): a recording for one du'a — a file or the phone's recorder —
 * with who recited it and the rights confirmed. The Arabic is shown to check the recording against: it must match
 * the card. Always in Khmer, like the qasidah form.
 */
export function DuaUploadSheet({ dua, current, open, onOpenChange }: { dua: Dua; current: DuaUploaded | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useKhmerT()
  const upload = useDuaUpload()
  const remove = useDuaRemove()
  const [file, setFile] = useState<File | null>(null)
  const [credit, setCredit] = useState("")
  const [rights, setRights] = useState(false)

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const problem = duaUploadError({ file, credit, rights })
    if (problem || !file) return void toast.error(t(problem ?? "duas.upload.fileRequired"))
    upload.mutate(
      { dua: dua.id, credit: credit.trim(), file },
      {
        onSuccess: () => {
          toast.success(t("duas.upload.saved"))
          setFile(null)
          setCredit("")
          setRights(false)
          onOpenChange(false)
        },
        onError: (err) => toast.error(t(err.message === "too_big" ? "duas.upload.tooBig" : err.message === "not_audio" ? "duas.upload.notAudio" : "duas.upload.failed")),
      },
    )
  }

  const takeOff = () =>
    remove.mutate(dua.id, {
      onSuccess: () => {
        toast.success(t("duas.upload.removed"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("duas.upload.failed")),
    })

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={`${t("duas.upload.title")} · ${dua.title.km}`}>
      <form onSubmit={send} className="space-y-3">
        <p dir="rtl" lang="ar" className="rounded-xl bg-muted/50 px-3 py-2 font-arabic text-xl leading-[2]">
          {dua.arabic}
        </p>
        <p className="text-xs text-muted-foreground">{t("duas.upload.intro")}</p>
        {current && (
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {t("duas.upload.current")}: {current.credit}
            </span>
            <Button type="button" size="sm" variant="ghost" className="h-9 text-destructive" disabled={remove.isPending} onClick={takeOff}>
              {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              {t("duas.upload.remove")}
            </Button>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="dua-file">{t("duas.upload.file")}</Label>
          <Input id="dua-file" type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dua-credit">{t("duas.upload.credit")}</Label>
          <Input id="dua-credit" value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={200} placeholder={t("duas.upload.creditPlaceholder")} className="h-11" />
        </div>
        <label htmlFor="dua-rights" className="flex min-h-11 items-start gap-3 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          <input id="dua-rights" type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-emerald-600" />
          <span>{t("duas.upload.confirm")}</span>
        </label>
        <Button type="submit" className="h-11 w-full" disabled={upload.isPending}>
          {upload.isPending && <Loader2Icon className="animate-spin" />}
          {t(upload.isPending ? "duas.upload.sending" : "duas.upload.send")}
        </Button>
      </form>
    </BottomSheet>
  )
}
