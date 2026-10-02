"use client"

import { CopyIcon, DownloadIcon, Loader2Icon, MessageSquareTextIcon, QrCodeIcon, SendIcon, Share2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { Debt } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { useMyKhqr } from "@/lib/profile"
import { buildReminder, smsUrl, telegramShareUrl, type ReminderLanguage } from "@/lib/reminder"
import { useLocaleStore } from "@/stores/locale-store"

/** The KHQR as a file for the share sheet (Telegram, Messenger…), or null if it can't be fetched. */
async function khqrFile(url: string): Promise<File | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"
    return new File([blob], `KHQR.${ext}`, { type: blob.type || "image/jpeg" })
  } catch {
    return null
  }
}

/**
 * Polite payment reminder for a receivable, with the user's own KHQR so the
 * debtor can scan and pay. Nothing is sent from the app: the user copies the
 * text or hands text + QR to the share sheet / Telegram and sends it.
 */
export function ReminderSheet({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt }) {
  const t = useT()
  const uiLocale = useLocaleStore((s) => s.locale)
  const [language, setLanguage] = useState<ReminderLanguage>(uiLocale)
  const [text, setText] = useState("")
  const khqr = useMyKhqr()
  const [attach, setAttach] = useState(true)
  const withQr = Boolean(khqr.url) && attach
  const fileRef = useRef<HTMLInputElement>(null)
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  useEffect(() => {
    if (open) setText(buildReminder(debt, language, withQr))
  }, [open, debt, language, withQr])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("reminder.copied"))
      return
    } catch {
      // Clipboard API unavailable or denied (older WebViews, insecure origins): fall back below.
    }
    const area = document.getElementById("reminder-text") as HTMLTextAreaElement | null
    area?.select()
    if (area && document.execCommand("copy")) toast.success(t("reminder.copied"))
    else toast.error(t("reminder.copyFailed"))
  }

  const share = async () => {
    try {
      const file = withQr && khqr.url ? await khqrFile(khqr.url) : null
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ text, files: [file] })
      else {
        await navigator.share({ text })
        if (file) toast.info(t("reminder.qrSeparately"))
      }
    } catch {
      // Dismissed by the user.
    }
  }

  const pickQr = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return void toast.error(t("debtPhotos.notImage"))
    try {
      await khqr.save.mutateAsync(file)
      setAttach(true)
      toast.success(t("reminder.qrSaved"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("reminder.title")} description={debt.party_name}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("reminder.language")}</Label>
          <Segmented
            aria-label={t("reminder.language")}
            value={language}
            onChange={setLanguage}
            options={[
              { value: "km", label: "ខ្មែរ" },
              { value: "en", label: "English" },
            ]}
          />
        </div>

        {/* My KHQR: added once, attached to every reminder. */}
        <div className="rounded-xl border p-3">
          {khqr.url ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img src={khqr.url} alt="KHQR" className="size-16 shrink-0 rounded-lg border bg-white object-contain" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("reminder.attachQr")}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => fileRef.current?.click()} disabled={khqr.save.isPending}>
                    {t("prayerAlert.change")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                    <a href={khqr.url} download="KHQR" target="_blank" rel="noopener noreferrer" aria-label={t("reminder.saveQr")}>
                      <DownloadIcon />
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => khqr.save.mutate(null)} disabled={khqr.save.isPending} aria-label={t("reminder.removeQr")}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              <Switch checked={attach} onCheckedChange={setAttach} aria-label={t("reminder.attachQr")} />
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-3 text-left" disabled={khqr.save.isPending}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {khqr.save.isPending ? <Loader2Icon className="size-5 animate-spin" /> : <QrCodeIcon className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t("reminder.addQr")}</span>
                <span className="block text-xs text-muted-foreground">{t("reminder.addQrHint")}</span>
              </span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickQr(e.target.files?.[0])} aria-label={t("reminder.addQr")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reminder-text">{t("reminder.hint")}</Label>
          <textarea
            id="reminder-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-lg border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {canShare && (
            <Button type="button" className="col-span-2 h-11" onClick={() => void share()}>
              <Share2Icon />
              {t(withQr ? "reminder.shareWithQr" : "reminder.share")}
            </Button>
          )}
          <Button type="button" variant="outline" className="h-11" onClick={copy}>
            <CopyIcon />
            {t("reminder.copy")}
          </Button>
          <Button asChild className="h-11 bg-sky-500 text-white hover:bg-sky-600">
            <a href={telegramShareUrl(text)} target="_blank" rel="noopener noreferrer">
              <SendIcon />
              Telegram
            </a>
          </Button>
          {debt.contact_phone && (
            <Button asChild variant="outline" className="col-span-2 h-11">
              <a href={smsUrl(debt.contact_phone, text)}>
                <MessageSquareTextIcon />
                SMS
              </a>
            </Button>
          )}
        </div>
        {withQr && <p className="text-xs text-muted-foreground">{t("reminder.qrHint")}</p>}
      </div>
    </BottomSheet>
  )
}
