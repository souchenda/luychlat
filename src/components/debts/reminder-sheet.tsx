"use client"

import { CopyIcon, MessageSquareTextIcon, SendIcon, Share2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Debt } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { buildReminder, smsUrl, telegramShareUrl, type ReminderLanguage } from "@/lib/reminder"
import { useLocaleStore } from "@/stores/locale-store"

/**
 * Friendly payment reminder for a receivable. Nothing is sent from the app:
 * the user copies the text or hands it to Telegram / the system share sheet
 * (Messenger, etc.) and sends it themselves.
 */
export function ReminderSheet({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (open: boolean) => void; debt: Debt }) {
  const t = useT()
  const uiLocale = useLocaleStore((s) => s.locale)
  const [language, setLanguage] = useState<ReminderLanguage>(uiLocale)
  const [text, setText] = useState("")
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  useEffect(() => {
    if (open) setText(buildReminder(debt, language))
  }, [open, debt, language])

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
      await navigator.share({ text })
    } catch {
      // Dismissed by the user.
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

        <div className="space-y-2">
          <Label htmlFor="reminder-text">{t("reminder.hint")}</Label>
          <textarea
            id="reminder-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full resize-none rounded-lg border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
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
          {canShare && (
            <Button type="button" variant="outline" className="h-11" onClick={share}>
              <Share2Icon />
              {t("reminder.share")}
            </Button>
          )}
          {debt.contact_phone && (
            <Button asChild variant="outline" className="h-11">
              <a href={smsUrl(debt.contact_phone, text)}>
                <MessageSquareTextIcon />
                SMS
              </a>
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
