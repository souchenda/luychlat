"use client"

import { Loader2Icon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resetAllData } from "@/lib/auth/reset"
import { useT } from "@/lib/i18n/use-t"
import { useSessionStore } from "@/stores/session-store"

const CONFIRM_WORD = "RESET"

/** តំបន់គ្រោះថ្នាក់: irreversible "Reset All Data", behind a typed confirmation. */
export function DangerZone() {
  const t = useT()
  const isCloud = useSessionStore((s) => Boolean(s.user))
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD

  const reset = async () => {
    if (!confirmed) return
    setBusy(true)
    try {
      await resetAllData()
      // Full reload so every in-memory store starts from scratch.
      window.location.replace("/login")
    } catch {
      setBusy(false)
      toast.error(t("common.error"))
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-destructive">
        <TriangleAlertIcon className="size-4" />
        {t("danger.title")}
      </h2>
      <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <div>
          <p className="text-sm font-semibold">{t("danger.reset")}</p>
          <p className="text-xs text-muted-foreground">{t(isCloud ? "danger.resetHintCloud" : "danger.resetHint")}</p>
        </div>
        <Button variant="destructive" className="h-11 w-full" onClick={() => setOpen(true)}>
          <TriangleAlertIcon />
          {t("danger.reset")}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return
          setOpen(next)
          if (!next) setTyped("")
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlertIcon className="size-5" />
              {t("danger.reset")}
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block font-medium text-foreground">
                តើអ្នកពិតជាចង់លុបទិន្នន័យទាំងអស់មែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់ក្រោយបានឡើយ។
              </span>
              <span className="block">Are you sure you want to reset all data? This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>{t("danger.item.data")}</li>
            <li>{t("danger.item.receipts")}</li>
            <li>{t("danger.item.device")}</li>
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">{t("danger.typeToConfirm", { word: CONFIRM_WORD })}</Label>
            <Input
              id="reset-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={CONFIRM_WORD}
              disabled={busy}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={reset} disabled={!confirmed || busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t("danger.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
